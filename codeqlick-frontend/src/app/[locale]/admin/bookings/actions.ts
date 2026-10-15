'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { failedState, savedState } from '@/lib/actions';
import { adminCancelBooking, adminSaveBookingSettings } from '@/lib/api/bookings';
import {
  textToIntervals,
  WEEKDAYS,
  type BookingConfig,
  type Interval,
  type Weekday,
} from '@/lib/booking';
import { formBoolean, formString, formValues, type FormState } from '@/lib/forms';

function whole(formData: FormData, name: string, fallback: number): number {
  const value = Math.round(Number(formString(formData, name)));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export async function saveBookingSettingsAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Admin.bookings' });
  const td = await getTranslations({ locale, namespace: 'Weekdays' });
  const weekly = {} as Record<Weekday, Interval[]>;
  const fieldErrors: Record<string, string> = {};
  for (const day of WEEKDAYS) {
    const intervals = textToIntervals(formString(formData, `day.${day}`));
    if (intervals === null) fieldErrors[`day.${day}`] = t('hoursError', { day: td(day) });
    else weekly[day] = intervals;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return {
      status: 'error',
      message: t('hoursErrorTitle'),
      fieldErrors,
      values: formValues(formData),
    };
  }

  const config: BookingConfig = {
    enabled: formBoolean(formData, 'enabled'),
    meetingUrl: formString(formData, 'meetingUrl'),
    calendarEmail: formString(formData, 'calendarEmail'),
    durationMinutes: whole(formData, 'durationMinutes', 30),
    minNoticeHours: whole(formData, 'minNoticeHours', 24),
    horizonDays: whole(formData, 'horizonDays', 21),
    weekly,
  };
  try {
    await adminSaveBookingSettings(config);
  } catch (error) {
    return { ...(await failedState(error, locale, formData)), values: formValues(formData) };
  }
  revalidatePath(`/${locale}`, 'layout');
  return savedState(locale);
}

export async function cancelBookingAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminCancelBooking(id);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin`, 'layout');
  return { status: 'idle' };
}
