'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { updateMe } from '@/lib/api/auth';
import { setCruisingVisits } from '@/lib/api/cruising-notifications';
import { updateCruisingProfile } from '@/lib/api/cruising';
import { isApiError } from '@/lib/api/errors';
import { getSwipeStatus, saveSwipeProfile } from '@/lib/api/swipe';
import { setVideochatPeakAlerts } from '@/lib/api/videochat';
import { formBoolean, type FormState } from '@/lib/forms';

/**
 * The account site's own actions (architecture 6.5, decision 108): the language of the emails
 * and every app's optional emails and alerts, each through that app's own endpoint.
 */

async function done(locale: AppLocale, work: () => Promise<unknown>): Promise<FormState> {
  const tc = await getTranslations({ locale, namespace: 'Common' });
  try {
    await work();
  } catch (error) {
    if (isApiError(error) && error.status === 401) redirect(`/${locale}/login`);
    return { status: 'error', message: tc('genericError') };
  }
  revalidatePath(`/${locale}`, 'layout');
  return { status: 'success', message: tc('saved') };
}

/** The language the platform writes to the person in (English or Spanish). */
export async function emailLanguageAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const value = formData.get('emailLocale') === 'es' ? 'es' : 'en';
  return done(locale, () => updateMe({ locale: value }));
}

/** Cruising: alerts by email, favourites by email and notification, showing my visits. */
export async function cruisingNotificationsAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return done(locale, async () => {
    await updateCruisingProfile({
      emailAlerts: formBoolean(formData, 'emailAlerts'),
      favoriteAlerts: formBoolean(formData, 'favoriteAlerts'),
      favoriteEmails: formBoolean(formData, 'favoriteEmails'),
    });
    await setCruisingVisits(formBoolean(formData, 'showVisits'));
  });
}

/** Swipe's emails: its profile is sent back as it is, with only `emailAlerts` changed. */
export async function swipeNotificationsAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return done(locale, async () => {
    const { profile } = await getSwipeStatus();
    if (!profile?.nickname) return;
    await saveSwipeProfile({
      nickname: profile.nickname,
      gender: profile.gender,
      seeking: profile.seeking,
      interests: profile.interests,
      bio: profile.bio,
      birthYear: profile.birthYear,
      country: profile.country,
      ageMin: profile.ageMin,
      ageMax: profile.ageMax,
      sameCountry: profile.sameCountry,
      emailAlerts: formBoolean(formData, 'emailAlerts'),
      blurPhotos: profile.blurPhotos,
    });
  });
}

/** The video chat's peak time alerts. */
export async function videochatNotificationsAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return done(locale, () => setVideochatPeakAlerts(formBoolean(formData, 'peakAlerts')));
}
