'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { failedState } from '@/lib/actions';
import { isApiError } from '@/lib/api/errors';
import { adminSetMaintenanceIncluded } from '@/lib/api/maintenance';
import { formValues, type FormState } from '@/lib/forms';

/**
 * Marks a project's maintenance plan included for free with why, or (`remove`) removes it
 * (architecture 8.2, decision 110).
 */
export async function setMaintenanceIncludedAction(
  locale: AppLocale,
  projectId: string,
  remove: boolean,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Maintenance.admin' });
  const values = formValues(formData);
  const raw = formData.get('reason');
  const reason = typeof raw === 'string' ? raw.trim() : '';
  if (!remove && (reason.length < 3 || reason.length > 300)) {
    return { status: 'error', fieldErrors: { reason: t('reasonHint') }, values };
  }
  try {
    await adminSetMaintenanceIncluded(projectId, remove ? null : reason);
  } catch (error) {
    if (isApiError(error) && error.status === 409) {
      return { status: 'error', message: t('paid'), values };
    }
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin`, 'layout');
  revalidatePath(`/${locale}/portal`, 'layout');
  return { status: 'success', message: remove ? t('removed') : t('included') };
}
