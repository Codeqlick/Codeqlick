'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import {
  cancelCruisingMeetup,
  createCruisingMeetup,
  createCruisingSafetyAlert,
  createCruisingTrip,
  deleteCruisingTrip,
  setCruisingAttendance,
  voteCruisingSafetyAlert,
} from '@/lib/api/cruising-community';
import { isApiError } from '@/lib/api/errors';
import { SLUG } from '@/lib/cruising';
import {
  isSafetyKind,
  parseMeetupForm,
  SAFETY_NOTE_MAX,
  tripDatesError,
} from '@/lib/cruising-community';
import type { FormState } from '@/lib/forms';

/**
 * Cruising's phase 5 actions (architecture 4.15): meetups (decision 88), trips (decision 90) and
 * safety alerts (decision 91). The browser never calls the API: these do, with the session.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COUNTRY = /^[A-Z]{2}$/;

/** Every Cruising page in both languages shows what changed. */
function refreshAll(): void {
  for (const each of routing.locales) revalidatePath(`/${each}/cruising`, 'layout');
}

const statusOf = (error: unknown) => (isApiError(error) ? error.status : 0);

// ---- Meetups ---------------------------------------------------------------------------------------

/** Plans a meetup at a spot (POST /cruising/meetups). */
export async function planMeetupAction(
  locale: AppLocale,
  spotId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.meetups' });
  const values = {
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? ''),
    hours: String(formData.get('hours') ?? ''),
    capacity: String(formData.get('capacity') ?? ''),
    startsAtLocal: String(formData.get('startsAtLocal') ?? ''),
  };
  if (!UUID.test(spotId)) return { status: 'error', message: t('error'), values };
  const { value, errors } = parseMeetupForm({
    startsAt: formData.get('startsAt'),
    hours: formData.get('hours'),
    title: formData.get('title'),
    description: formData.get('description'),
    capacity: formData.get('capacity'),
  });
  if (!value) {
    const fieldErrors = Object.fromEntries(
      Object.entries(errors).map(([field, key]) => [
        field === 'startsAt' ? 'startsAtLocal' : field,
        t(`errors.${key}`),
      ]),
    );
    return { status: 'error', fieldErrors, values };
  }
  try {
    await createCruisingMeetup({
      spotId,
      startsAt: value.startsAt,
      hours: value.hours,
      title: value.title,
      description: value.description || undefined,
      capacity: value.capacity,
    });
  } catch (error) {
    const status = statusOf(error);
    if (status === 400) return { status: 'error', message: t('refused'), values };
    if (status === 409) return { status: 'error', message: t('needNickname'), values };
    if (status === 429) return { status: 'error', message: t('tooManyThisWeek'), values };
    if (status === 403) return { status: 'error', message: t('notAllowed'), values };
    if (status === 404) return { status: 'error', message: t('spotGone'), values };
    return { status: 'error', message: t('error'), values };
  }
  refreshAll();
  return { status: 'success', message: t('planned') };
}

/** "I'm going" (anonymously or not) or "not going" (PUT · DELETE …/attendance). */
export async function attendanceAction(
  locale: AppLocale,
  meetupId: string,
  going: boolean,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.meetups' });
  if (!UUID.test(meetupId)) return { status: 'error', message: t('error') };
  try {
    await setCruisingAttendance(meetupId, going, formData.get('anonymous') === 'on');
  } catch (error) {
    const status = statusOf(error);
    if (status === 409) return { status: 'error', message: t('fullOrOver') };
    if (status === 404) return { status: 'error', message: t('gone') };
    if (status === 403) return { status: 'error', message: t('notAllowed') };
    return { status: 'error', message: t('error') };
  }
  refreshAll();
  return { status: 'success', message: t(going ? 'goingSaved' : 'notGoingSaved') };
}

/** The host cancels (DELETE /cruising/meetups/:id). */
export async function cancelMeetupAction(
  locale: AppLocale,
  meetupId: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.meetups' });
  if (!UUID.test(meetupId)) return { status: 'error', message: t('error') };
  try {
    await cancelCruisingMeetup(meetupId);
  } catch (error) {
    if (statusOf(error) === 409) return { status: 'error', message: t('fullOrOver') };
    return { status: 'error', message: t('error') };
  }
  refreshAll();
  return { status: 'success', message: t('cancelled') };
}

// ---- Trips -----------------------------------------------------------------------------------------

/** Announces a trip to a city (POST /cruising/trips). */
export async function createTripAction(
  locale: AppLocale,
  place: { countryCode: string; citySlug: string },
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.trips' });
  const from = String(formData.get('from') ?? '');
  const to = String(formData.get('to') ?? '');
  const listed = formData.get('private') !== 'on';
  const values = { from, to };
  if (!COUNTRY.test(place.countryCode) || !SLUG.test(place.citySlug)) {
    return { status: 'error', message: t('error'), values };
  }
  const problem = tripDatesError(from, to);
  if (problem) {
    return {
      status: 'error',
      fieldErrors: {
        [problem === 'order' || problem === 'tooLong' ? 'to' : 'from']: t(`errors.${problem}`),
      },
      values,
    };
  }
  try {
    await createCruisingTrip({ ...place, from, to, listed });
  } catch (error) {
    const status = statusOf(error);
    if (status === 409) return { status: 'error', message: t('tooMany'), values };
    if (status === 404) return { status: 'error', message: t('cityGone'), values };
    if (status === 403) return { status: 'error', message: t('notAllowed'), values };
    if (status === 400) return { status: 'error', message: t('errors.dates'), values };
    return { status: 'error', message: t('error'), values };
  }
  refreshAll();
  return { status: 'success', message: t('saved') };
}

export async function deleteTripAction(
  locale: AppLocale,
  tripId: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.trips' });
  if (!UUID.test(tripId)) return { status: 'error', message: t('error') };
  try {
    await deleteCruisingTrip(tripId);
  } catch {
    return { status: 'error', message: t('error') };
  }
  refreshAll();
  return { status: 'success', message: t('deleted') };
}

// ---- Safety alerts ---------------------------------------------------------------------------------

/** Posts a safety alert at a spot (POST /cruising/spots/:id/alerts). */
export async function postSafetyAlertAction(
  locale: AppLocale,
  spotId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.safety' });
  const kind = formData.get('kind');
  const note = String(formData.get('note') ?? '').trim();
  const values = { kind: typeof kind === 'string' ? kind : '', note };
  if (!UUID.test(spotId)) return { status: 'error', message: t('error'), values };
  if (!isSafetyKind(kind)) {
    return { status: 'error', fieldErrors: { kind: t('kindNeeded') }, values };
  }
  if (note.length > SAFETY_NOTE_MAX) {
    return { status: 'error', fieldErrors: { note: t('noteTooLong') }, values };
  }
  try {
    await createCruisingSafetyAlert(spotId, { kind, note: note || undefined });
  } catch (error) {
    const status = statusOf(error);
    if (status === 400) return { status: 'error', message: t('refused'), values };
    if (status === 429) return { status: 'error', message: t('tooManyToday'), values };
    if (status === 403) return { status: 'error', message: t('notAllowed'), values };
    return { status: 'error', message: t('error'), values };
  }
  refreshAll();
  return { status: 'success', message: t('posted') };
}

/** "Still there" or "gone" on an alert (POST /cruising/alerts/:id/confirm · /gone). */
export async function voteSafetyAlertAction(
  locale: AppLocale,
  alertId: string,
  vote: 'confirm' | 'gone',
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.safety' });
  if (!UUID.test(alertId)) return { status: 'error', message: t('error') };
  try {
    await voteCruisingSafetyAlert(alertId, vote);
  } catch (error) {
    const status = statusOf(error);
    if (status === 409) return { status: 'error', message: t('alreadyVoted') };
    if (status === 404) return { status: 'error', message: t('ended') };
    if (status === 403) return { status: 'error', message: t('notAllowed') };
    return { status: 'error', message: t('error') };
  }
  refreshAll();
  return { status: 'success', message: t('thanks') };
}
