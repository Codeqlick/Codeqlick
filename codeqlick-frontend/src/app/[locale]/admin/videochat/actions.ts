'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { failedState } from '@/lib/actions';
import {
  bulkVideochatReports,
  clearVideochatSuspicion,
  dismissVideochatReport,
  liftVideochatSuspension,
  resolveVideochatAppeal,
  setVideochatAgeVerified,
  SUSPENSION_DURATIONS,
  suspendFromVideochatReport,
  suspendVideochatUser,
  type SuspensionDuration,
} from '@/lib/api/videochat';
import type { FormState } from '@/lib/forms';

async function done(locale: AppLocale): Promise<FormState> {
  revalidatePath(`/${locale}/admin/videochat`, 'layout');
  const t = await getTranslations({ locale, namespace: 'AdminVideochat' });
  return { status: 'success', message: t('done') };
}

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
  return done(locale);
}

function duration(formData: FormData): SuspensionDuration {
  const value = formData.get('duration');
  return SUSPENSION_DURATIONS.find((d) => d === value) ?? 'permanent';
}

function text(formData: FormData, name: string): string | undefined {
  return String(formData.get(name) ?? '').trim() || undefined;
}

export async function dismissReportAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(locale, formData, () => dismissVideochatReport(id));
}

/** The selected reports (checkboxes joined to the bulk form), dismissed or suspended at once. */
export async function bulkReportsAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'AdminVideochat' });
  const ids = formData.getAll('ids').map(String).filter(Boolean).slice(0, 100);
  if (ids.length === 0) return { status: 'error', message: t('bulk.none') };
  const action = formData.get('bulkAction') === 'suspend' ? 'suspend' : 'dismiss';
  let result: { done: number; skipped: number };
  try {
    result = await bulkVideochatReports(ids, action, duration(formData));
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin/videochat`, 'layout');
  return { status: 'success', message: t('bulk.done', result) };
}

export async function suspendReportAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(locale, formData, () =>
    suspendFromVideochatReport(id, duration(formData), text(formData, 'reason')),
  );
}

export async function liftSuspensionAction(
  locale: AppLocale,
  userId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(locale, formData, () => liftVideochatSuspension(userId));
}

export async function suspendUserAction(
  locale: AppLocale,
  userId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const reason = text(formData, 'reason');
  if (!reason) {
    const t = await getTranslations({ locale, namespace: 'AdminVideochat' });
    return {
      status: 'error',
      fieldErrors: { reason: t('reasonRequired') },
      values: { duration: duration(formData) },
    };
  }
  return run(locale, formData, () =>
    suspendVideochatUser(userId, { reason, duration: duration(formData) }),
  );
}

export async function ageVerifiedAction(
  locale: AppLocale,
  userId: string,
  verified: boolean,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(locale, formData, () => setVideochatAgeVerified(userId, verified));
}

export async function resolveAppealAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const accept = formData.get('decision') === 'accept';
  return run(locale, formData, () =>
    resolveVideochatAppeal(id, accept, text(formData, 'response')),
  );
}

/** "Not suspicious": hidden from the suspicious accounts list for 30 days. */
export async function clearSuspicionAction(
  locale: AppLocale,
  userId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(locale, formData, () => clearVideochatSuspicion(userId));
}
