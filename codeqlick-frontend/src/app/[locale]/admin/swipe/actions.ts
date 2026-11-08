'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { failedState } from '@/lib/actions';
import {
  actOnSwipeReport,
  approveSwipePhoto,
  decideSwipeTakedown,
  decideSwipeVerification,
  dismissSwipeReport,
  hideSwipePhoto,
  liftSwipeSuspension,
  rejectSwipePhoto,
  SWIPE_SUSPENSIONS,
  type SwipeSuspension,
} from '@/lib/api/swipe';
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
  revalidatePath(`/${locale}/admin/swipe`);
  const t = await getTranslations({ locale, namespace: 'AdminSwipe' });
  return { status: 'success', message: t('done') };
}

function text(formData: FormData, name: string): string | undefined {
  return String(formData.get(name) ?? '').trim() || undefined;
}

function suspension(formData: FormData): SwipeSuspension | null {
  const value = formData.get('suspend');
  return SWIPE_SUSPENSIONS.find((d) => d === value) ?? null;
}

export async function verificationAction(
  locale: AppLocale,
  userId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const approve = formData.get('decision') === 'approve';
  return run(locale, formData, () =>
    decideSwipeVerification(userId, approve, text(formData, 'note')),
  );
}

export async function photoAction(
  locale: AppLocale,
  photoId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const decision = formData.get('decision');
  if (decision === 'approve') return run(locale, formData, () => approveSwipePhoto(photoId));
  if (decision === 'hide') return run(locale, formData, () => hideSwipePhoto(photoId));
  const t = await getTranslations({ locale, namespace: 'AdminSwipe' });
  const reason = text(formData, 'reason') ?? t('defaultRejectReason');
  return run(locale, formData, () =>
    rejectSwipePhoto(photoId, reason.slice(0, 300), formData.get('block') === 'on'),
  );
}

export async function reportAction(
  locale: AppLocale,
  reportId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (formData.get('decision') === 'dismiss') {
    return run(locale, formData, () => dismissSwipeReport(reportId));
  }
  return run(locale, formData, () =>
    actOnSwipeReport(reportId, {
      removePhoto: formData.get('removePhoto') === 'on',
      blockImage: formData.get('blockImage') === 'on',
      suspend: suspension(formData),
    }),
  );
}

export async function takedownAction(
  locale: AppLocale,
  takedownId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const remove = formData.get('decision') === 'remove';
  return run(locale, formData, () =>
    decideSwipeTakedown(takedownId, remove, text(formData, 'response')),
  );
}

export async function liftAction(
  locale: AppLocale,
  userId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(locale, formData, () => liftSwipeSuspension(userId));
}
