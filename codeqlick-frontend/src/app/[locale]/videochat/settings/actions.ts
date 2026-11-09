'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import { isApiError } from '@/lib/api/errors';
import {
  GENDERS,
  INTERESTS,
  MAX_INTERESTS,
  saveVideochatSettings,
  setVideochatPeakAlerts,
  subscribeVideochatPush,
  unsubscribeVideochatPush,
  uploadVideochatVerification,
  type Gender,
  type Interest,
  type PushSubscriptionInput,
} from '@/lib/api/videochat';
import type { AppLocale } from '@/i18n/routing';
import type { FormState } from '@/lib/forms';
import { isCountry, isLanguage } from '@/lib/videochat-options';

/** The nickname is the account's username: 3–20 of a-z, 0-9, `.` and `_`, letter or digit at both ends. */
const NICKNAME = /^(?!.*\.\.)[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$/;

function gender(value: FormDataEntryValue | null): Gender | null {
  return GENDERS.find((g) => g === value) ?? null;
}

/** Saves the public profile and filters (PUT /videochat/profile). */
export async function settingsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Videochat.settings' });
  const nickname = String(formData.get('nickname') ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  const country = String(formData.get('country') ?? '');
  const language = String(formData.get('language') ?? '');
  const seeking = formData
    .getAll('seeking')
    .map(gender)
    .filter((g): g is Gender => g !== null);
  const interests = [
    ...new Set(
      [...formData.getAll('interests'), ...formData.getAll('adultInterests')].filter(
        (value): value is Interest => (INTERESTS as readonly FormDataEntryValue[]).includes(value),
      ),
    ),
  ];
  const values: Record<string, string> = {
    nickname,
    interests: interests.join('\n'),
    adultInterests: interests.join('\n'),
    gender: String(formData.get('gender') ?? ''),
    seeking: seeking.join('\n'),
    country,
    language,
  };
  if (formData.get('sameCountryOnly') === 'on') values.sameCountryOnly = 'on';
  if (formData.get('sameLanguageOnly') === 'on') values.sameLanguageOnly = 'on';

  if (interests.length > MAX_INTERESTS) {
    return {
      status: 'error',
      fieldErrors: { interests: t('interestsTooMany', { max: MAX_INTERESTS }) },
      values,
    };
  }
  if (nickname && !NICKNAME.test(nickname)) {
    return { status: 'error', fieldErrors: { nickname: t('nicknameInvalid') }, values };
  }
  if (values.sameCountryOnly && !country) {
    return { status: 'error', fieldErrors: { country: t('countryNeeded') }, values };
  }
  if (values.sameLanguageOnly && !language) {
    return { status: 'error', fieldErrors: { language: t('languageNeeded') }, values };
  }

  try {
    await saveVideochatSettings({
      nickname: nickname || null,
      gender: gender(formData.get('gender')),
      seeking,
      country: isCountry(country) ? country : null,
      language: isLanguage(language) ? language : null,
      sameCountryOnly: Boolean(values.sameCountryOnly),
      sameLanguageOnly: Boolean(values.sameLanguageOnly),
      interests,
    });
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 409) {
      return { status: 'error', fieldErrors: { nickname: t('nicknameTaken') }, values };
    }
    if (status === 400) {
      return { status: 'error', fieldErrors: { nickname: t('nicknameReserved') }, values };
    }
    return { status: 'error', message: t('error'), values };
  }
  revalidatePath(`/${locale}/videochat/settings`);
  return { status: 'success', message: t('saved') };
}

/** Stores this browser's push subscription (PUT /videochat/push). */
export async function pushSubscribeAction(input: PushSubscriptionInput): Promise<{ ok: boolean }> {
  try {
    await subscribeVideochatPush({
      endpoint: String(input.endpoint),
      keys: { p256dh: String(input.keys?.p256dh), auth: String(input.keys?.auth) },
      locale: input.locale === 'es' ? 'es' : 'en',
    });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** Forgets this browser's push subscription (DELETE /videochat/push). */
export async function pushUnsubscribeAction(endpoint: string): Promise<{ ok: boolean }> {
  try {
    await unsubscribeVideochatPush(String(endpoint));
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** "Also tell me at peak time" for the account (PUT /videochat/push/peak). */
export async function peakAlertsAction(on: boolean): Promise<{ ok: boolean }> {
  try {
    await setVideochatPeakAlerts(on === true);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/** The photo is shrunk in the browser first: anything bigger is not a phone photo. */
const MAX_VERIFICATION_BYTES = 5 * 1024 * 1024;

/** Sends the verification photo (the person with a paper showing their nickname and the date). */
export async function uploadVerificationAction(
  locale: AppLocale,
  formData: FormData,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const t = await getTranslations({ locale, namespace: 'Swipe.upload' });
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: t('noFile') };
  if (file.size > MAX_VERIFICATION_BYTES) return { ok: false, message: t('tooBig') };
  if (formData.get('consent') !== 'on') return { ok: false, message: t('mustConsent') };
  try {
    await uploadVideochatVerification(file);
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 400) return { ok: false, message: t('notImage') };
    if (status === 409) {
      const tv = await getTranslations({ locale, namespace: 'Videochat.verification' });
      return { ok: false, message: tv('nicknameFirst') };
    }
    if (status === 429) return { ok: false, message: t('tooManyToday') };
    return { ok: false, message: t('error') };
  }
  revalidatePath(`/${locale}/videochat/settings`);
  return { ok: true };
}
