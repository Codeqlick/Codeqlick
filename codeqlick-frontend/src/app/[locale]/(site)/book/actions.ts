'use server';

import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { localeOrDefault } from '@/i18n/locale';
import { cancelBooking, createBooking } from '@/lib/api/bookings';
import { isApiError } from '@/lib/api/errors';
import { formObject, formString, formValues, zodFieldErrors, type FormState } from '@/lib/forms';

/** Nobody picks a time and fills in the form this fast (see the contact form). */
const MIN_FILL_MS = 3000;

const bookingSchema = z.object({
  startsAt: z.string().min(1, 'choice'),
  name: z.string().trim().min(2, 'tooShort').max(120, 'tooLong'),
  email: z.string().trim().min(1, 'required').max(254, 'tooLong').pipe(z.email('email')),
  company: z.string().trim().max(160, 'tooLong'),
  message: z.string().trim().max(2000, 'tooLong'),
});

export async function bookCallAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Book' });
  const tv = await getTranslations({ locale, namespace: 'Validation' });

  const renderedAt = Number(formString(formData, 'renderedAt'));
  if (
    formString(formData, 'website') !== '' ||
    !Number.isFinite(renderedAt) ||
    Date.now() - renderedAt < MIN_FILL_MS
  ) {
    console.warn('Booking discarded as automated');
    return { status: 'success' };
  }

  const values = formValues(formData, ['website', 'locale', 'renderedAt']);
  const parsed = bookingSchema.safeParse(
    formObject(formData, ['startsAt', 'name', 'email', 'company', 'message']),
  );
  if (!parsed.success) {
    return {
      status: 'error',
      message: t('error'),
      fieldErrors: zodFieldErrors(parsed.error, (key) => tv(key)),
      values,
    };
  }

  const { startsAt, name, email, company, message } = parsed.data;
  try {
    await createBooking({
      startsAt,
      name,
      email,
      company: company || undefined,
      message: message || undefined,
      locale,
    });
  } catch (error) {
    if (isApiError(error) && error.status === 409) {
      return { status: 'error', message: t('taken'), values: { ...values, startsAt: '' } };
    }
    if (isApiError(error) && error.status === 429) {
      return { status: 'error', message: t('tooMany'), values };
    }
    return { status: 'error', message: t('failed'), values };
  }
  return { status: 'success', values: { startsAt } };
}

export async function cancelCallAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Book' });
  try {
    await cancelBooking(formString(formData, 'token'));
  } catch (error) {
    return {
      status: 'error',
      message: isApiError(error) && error.status === 404 ? t('cancelNotFound') : t('failed'),
    };
  }
  return { status: 'success' };
}
