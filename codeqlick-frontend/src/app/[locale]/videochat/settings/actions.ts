'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import { isApiError } from '@/lib/api/errors';
import { GENDERS, saveVideochatSettings, type Gender } from '@/lib/api/videochat';
import type { FormState } from '@/lib/forms';
import { isCountry, isLanguage } from '@/lib/videochat-options';

const NICKNAME = /^[\p{L}\p{N} ._-]{2,24}$/u;

function gender(value: FormDataEntryValue | null): Gender | null {
  return GENDERS.find((g) => g === value) ?? null;
}

/** Saves the public profile and filters (PUT /videochat/profile). */
export async function settingsAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Videochat.settings' });
  const nickname = String(formData.get('nickname') ?? '').trim();
  const country = String(formData.get('country') ?? '');
  const language = String(formData.get('language') ?? '');
  const seeking = formData
    .getAll('seeking')
    .map(gender)
    .filter((g): g is Gender => g !== null);
  const values: Record<string, string> = {
    nickname,
    gender: String(formData.get('gender') ?? ''),
    seeking: seeking.join('\n'),
    country,
    language,
  };
  if (formData.get('sameCountryOnly') === 'on') values.sameCountryOnly = 'on';
  if (formData.get('sameLanguageOnly') === 'on') values.sameLanguageOnly = 'on';

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
    });
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 400) {
      return { status: 'error', fieldErrors: { nickname: t('nicknameInvalid') }, values };
    }
    return { status: 'error', message: t('error'), values };
  }
  revalidatePath(`/${locale}/videochat/settings`);
  return { status: 'success', message: t('saved') };
}
