'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { failedState } from '@/lib/actions';
import { adminRequestBrief } from '@/lib/api/briefs';
import type { FormState } from '@/lib/forms';

/** Asks the client for the brief (an email to every person of the account). */
export async function requestBriefAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminRequestBrief(projectId);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin`, 'layout');
  revalidatePath(`/${locale}/portal`, 'layout');
  const t = await getTranslations({ locale, namespace: 'Brief' });
  return { status: 'success', message: t('requested') };
}
