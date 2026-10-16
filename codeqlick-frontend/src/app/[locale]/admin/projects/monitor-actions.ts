'use server';

import { revalidatePath } from 'next/cache';
import type { AppLocale } from '@/i18n/routing';
import { failedState } from '@/lib/actions';
import { adminCheckNow, adminSetMonitor } from '@/lib/api/monitoring';
import type { FormState } from '@/lib/forms';

function revalidateMonitoring(locale: AppLocale) {
  revalidatePath(`/${locale}/admin`, 'layout');
  revalidatePath(`/${locale}/portal`, 'layout');
}

export async function setMonitorAction(
  locale: AppLocale,
  projectId: string,
  enabled: boolean,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminSetMonitor(projectId, enabled);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateMonitoring(locale);
  return { status: 'idle' };
}

export async function checkNowAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminCheckNow(projectId);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateMonitoring(locale);
  return { status: 'idle' };
}
