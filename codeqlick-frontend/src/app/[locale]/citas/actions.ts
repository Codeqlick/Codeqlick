'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { localeOrDefault } from '@/i18n/locale';
import {
  bookCitasAppointment,
  cancelCitasAppointment,
  cancelCitasWithToken,
  createCitasPage,
  deleteCitasPage,
  updateCitasPage,
  type CitasPageInput,
  type Weekly,
} from '@/lib/api/citas';
import { isApiError } from '@/lib/api/errors';
import { textToIntervals, WEEKDAYS } from '@/lib/booking';
import { CITAS_DURATIONS, CITAS_TIME_ZONES, isValidSlug, slugify } from '@/lib/citas';
import {
  formBoolean,
  formObject,
  formString,
  formValues,
  zodFieldErrors,
  type FormState,
} from '@/lib/forms';

function whole(formData: FormData, name: string, fallback: number, max: number): number {
  const value = Math.round(Number(formString(formData, name)));
  return Number.isFinite(value) && value >= 0 ? Math.min(value, max) : fallback;
}

/** Whether any two ranges of a day overlap. */
function overlaps(weekly: Weekly): boolean {
  return WEEKDAYS.some((day) => {
    const sorted = weekly[day].toSorted((a, b) => a.start.localeCompare(b.start));
    return sorted.some((item, index) => index > 0 && item.start < sorted[index - 1]!.end);
  });
}

/** Creates (no id) or saves a booking page from the editor, then goes back to the panel. */
export async function savePageAction(
  locale: string,
  id: string | null,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const lang = localeOrDefault(locale);
  const t = await getTranslations({ locale: lang, namespace: 'Citas.editor' });
  const tw = await getTranslations({ locale: lang, namespace: 'Citas.weekdays' });
  const values = formValues(formData);
  const fieldErrors: Record<string, string> = {};

  const title = formString(formData, 'title').slice(0, 200);
  if (title.length < 1 || title.length > 80) fieldErrors.title = t('error');
  const slug = slugify(formString(formData, 'slug')) || slugify(title);
  if (!isValidSlug(slug)) fieldErrors.slug = t('slugInvalid');
  const description = formString(formData, 'description');
  if (description.length > 500) fieldErrors.description = t('descriptionHint');
  const location = formString(formData, 'location');
  if (location.length > 200) fieldErrors.location = t('error');
  const duration = Number(formString(formData, 'durationMinutes'));
  const durationMinutes = (CITAS_DURATIONS as readonly number[]).includes(duration) ? duration : 30;
  const zone = formString(formData, 'timeZone');
  const timeZone = (CITAS_TIME_ZONES as readonly string[]).includes(zone) ? zone : 'Europe/Madrid';

  const weekly = Object.fromEntries(WEEKDAYS.map((day) => [day, []])) as unknown as Weekly;
  for (const day of WEEKDAYS) {
    const intervals = textToIntervals(formString(formData, `day.${day}`));
    if (intervals === null || intervals.some((item) => item.end > '23:59')) {
      fieldErrors[`day.${day}`] = t('hoursInvalid', { day: tw(day) });
    } else weekly[day] = intervals;
  }
  if (!fieldErrors['day.mon'] && overlaps(weekly)) fieldErrors['day.mon'] = t('hoursOverlap');
  const enabled = formBoolean(formData, 'enabled');
  if (enabled && WEEKDAYS.every((day) => weekly[day].length === 0) && !fieldErrors['day.mon']) {
    fieldErrors['day.mon'] = t('noHours');
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { status: 'error', message: t('error'), fieldErrors, values };
  }

  const input: CitasPageInput = {
    slug,
    title,
    description,
    durationMinutes,
    location,
    video: formBoolean(formData, 'video'),
    askPhone: formBoolean(formData, 'askPhone'),
    timeZone,
    weekly,
    minNoticeHours: whole(formData, 'minNoticeHours', 12, 24 * 30),
    horizonDays: Math.max(1, whole(formData, 'horizonDays', 30, 180)),
    enabled,
  };
  try {
    if (id) await updateCitasPage(id, input);
    else await createCitasPage(input);
  } catch (error) {
    if (isApiError(error) && error.status === 409) {
      if (/link/i.test(error.message)) {
        return { status: 'error', fieldErrors: { slug: t('slugTaken') }, values };
      }
      return { status: 'error', message: t('tooMany'), values };
    }
    if (isApiError(error) && error.status === 404) {
      return { status: 'error', message: t('notFound'), values };
    }
    return { status: 'error', message: t('failed'), values };
  }
  revalidatePath(`/${lang}/citas`);
  redirect(`/${lang}/citas`);
}

/** Pauses a page or takes bookings again. */
export async function togglePageAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  const id = formString(formData, 'id');
  await updateCitasPage(id, { enabled: formString(formData, 'enabled') === 'on' }).catch(
    () => undefined,
  );
  revalidatePath(`/${locale}/citas`);
}

/** Deletes a page; its upcoming appointments are cancelled and the people emailed. */
export async function deletePageAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await deleteCitasPage(formString(formData, 'id')).catch(() => undefined);
  revalidatePath(`/${locale}/citas`);
}

/** The owner cancels an appointment; whoever booked is emailed. */
export async function cancelAppointmentAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));
  await cancelCitasAppointment(formString(formData, 'id')).catch(() => undefined);
  revalidatePath(`/${locale}/citas`);
}

/** Nobody picks a time and fills in the form this fast (see the contact form). */
const MIN_FILL_MS = 3000;

const bookingSchema = z.object({
  startsAt: z.string().min(1, 'choice'),
  name: z.string().trim().min(2, 'tooShort').max(120, 'tooLong'),
  email: z.string().trim().min(1, 'required').max(254, 'tooLong').pipe(z.email('email')),
  phone: z.string().trim().max(40, 'tooLong'),
  note: z.string().trim().max(500, 'tooLong'),
});

/** Books a time on a public page. On success `values` carries what the confirmation shows. */
export async function bookAction(
  slug: string,
  askPhone: boolean,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Citas.public' });
  const tv = await getTranslations({ locale, namespace: 'Validation' });

  const renderedAt = Number(formString(formData, 'renderedAt'));
  const values = formValues(formData, ['website', 'locale', 'renderedAt']);
  const parsed = bookingSchema.safeParse(
    formObject(formData, ['startsAt', 'name', 'email', 'phone', 'note']),
  );
  if (!parsed.success) {
    return {
      status: 'error',
      message: t('error'),
      fieldErrors: zodFieldErrors(parsed.error, (key) => tv(key)),
      values,
    };
  }
  const { startsAt, name, email, phone, note } = parsed.data;
  if (askPhone && phone.length < 6) {
    return { status: 'error', message: t('error'), fieldErrors: { phone: tv('required') }, values };
  }
  const tooFast = !Number.isFinite(renderedAt) || Date.now() - renderedAt < MIN_FILL_MS;
  try {
    const booked = await bookCitasAppointment(slug, {
      startsAt,
      name,
      email,
      phone: phone || undefined,
      note: note || undefined,
      locale,
      // A form filled in faster than a person could goes to the API's honeypot.
      website: tooFast ? 'fast' : formString(formData, 'website') || undefined,
    });
    return {
      status: 'success',
      values: { startsAt: booked.startsAt, video: booked.meetingCode ? 'yes' : '' },
    };
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 409) {
      return { status: 'error', message: t('taken'), values: { ...values, startsAt: '' } };
    }
    if (status === 429) return { status: 'error', message: t('tooMany'), values };
    if (status === 400) {
      return {
        status: 'error',
        message: t('error'),
        fieldErrors: { phone: tv('required') },
        values,
      };
    }
    return { status: 'error', message: t('failed'), values };
  }
}

/** From the emailed link: cancels the appointment. */
export async function cancelWithTokenAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Citas.cancel' });
  try {
    const result = await cancelCitasWithToken(formString(formData, 'token'));
    return { status: 'success', message: t('done', { name: result.ownerName }) };
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 404) return { status: 'error', message: t('notFound') };
    if (status === 409) return { status: 'error', message: t('past') };
    return { status: 'error', message: t('failed') };
  }
}
