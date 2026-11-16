'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { updateCruisingProfile } from '@/lib/api/cruising';
import type { FormState } from '@/lib/forms';
import { appPath } from '@/lib/webapp-request';

/**
 * Cruising's onboarding tour (architecture 4.15, decision 102): finished, skipped or reopened. The
 * browser never calls the API: these do, with the session.
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
