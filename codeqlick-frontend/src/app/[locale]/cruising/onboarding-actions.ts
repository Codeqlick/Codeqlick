'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { updateMe } from '@/lib/api/auth';
import { updateCruisingProfile } from '@/lib/api/cruising';
import type { FormState } from '@/lib/forms';
import { appPath } from '@/lib/webapp-request';

/**
 * Cruising's onboarding tour (architecture 4.15, decision 102): finished, skipped or reopened; and
 * the account's language (decision 103). The browser never calls the API: these do, with the
 * session.
 */

function refreshAll(): void {
  for (const each of routing.locales) revalidatePath(`/${each}/cruising`, 'layout');
}

/** "Done" or "Skip": the tour isn't shown again (PATCH /cruising/profile `onboardingDone`). */
export async function finishTourAction(
  locale: AppLocale,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.tour' });
  try {
    await updateCruisingProfile({ onboardingDone: true });
  } catch {
    return { status: 'error', message: t('error') };
  }
  refreshAll();
  return { status: 'success' };
}

/** "Show the tour again" (from /me): it opens on the map. */
export async function reopenTourAction(
  locale: AppLocale,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.tour' });
  try {
    await updateCruisingProfile({ onboardingDone: false });
  } catch {
    return { status: 'error', message: t('error') };
  }
  refreshAll();
  redirect(await appPath(`/${locale}/cruising/map`, locale));
}

/**
 * The account's language (PATCH /auth/me `locale`, decision 103): Cruising's emails and push texts
 * come in it; the rest of Codeqlick writes in English unless it is Spanish.
 */
export async function accountLanguageAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.me' });
  const language = String(formData.get('language') ?? '');
  if (!hasLocale(routing.locales, language)) {
    return {
      status: 'error',
      fieldErrors: { language: t('languageInvalid') },
      values: { language },
    };
  }
  try {
    await updateMe({ locale: language });
  } catch {
    return { status: 'error', message: t('error'), values: { language } };
  }
  refreshAll();
  return { status: 'success', message: t('saved') };
}
