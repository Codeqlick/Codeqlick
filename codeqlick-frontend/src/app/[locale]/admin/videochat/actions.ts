'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { failedState } from '@/lib/actions';
import {
  dismissVideochatReport,
  liftVideochatSuspension,
  suspendFromVideochatReport,
} from '@/lib/api/videochat';
import type { FormState } from '@/lib/forms';

async function done(locale: AppLocale): Promise<FormState> {
  revalidatePath(`/${locale}/admin/videochat`);
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

export async function dismissReportAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(locale, formData, () => dismissVideochatReport(id));
}

export async function suspendReportAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(locale, formData, () => suspendFromVideochatReport(id));
}

export async function liftSuspensionAction(
  locale: AppLocale,
  userId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(locale, formData, () => liftVideochatSuspension(userId));
}
