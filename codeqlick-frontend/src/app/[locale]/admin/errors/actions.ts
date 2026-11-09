'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { failedState } from '@/lib/actions';
import { adminResolveAllErrors, adminSetErrorResolved } from '@/lib/api/error-reports';
import type { FormState } from '@/lib/forms';

async function run(
  locale: AppLocale,
  formData: FormData,
  call: () => Promise<unknown>,
): Promise<FormState> {
  try {
    await call();
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin/errors`, 'layout');
  const t = await getTranslations({ locale, namespace: 'AdminErrors' });
  return { status: 'success', message: t('done') };
}

/** Marks one error fixed (`resolve`) or open again (`reopen`). */
export async function errorStatusAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const resolved = formData.get('decision') !== 'reopen';
  return run(locale, formData, () => adminSetErrorResolved(id, resolved));
}

export async function resolveAllErrorsAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(locale, formData, () => adminResolveAllErrors());
}
