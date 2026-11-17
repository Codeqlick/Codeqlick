'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { failedState } from '@/lib/actions';
import {
  decideAdultVerification,
  deleteBannedEmail,
  keepReviewSuspension,
  liftAdultSuspension,
  shareReviewSuspension,
  suspendAdultUser,
  withdrawAdultVerification,
} from '@/lib/api/adult';
import { isApiError } from '@/lib/api/errors';
import {
  parseAdultApp,
  parseSeriousCategory,
  parseSharedDuration,
  type AdultApp,
} from '@/lib/adult';
import type { FormState } from '@/lib/forms';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  // Every admin page that shows the shared queue, the review list or the panel.
  revalidatePath(`/${locale}/admin`, 'layout');
  const t = await getTranslations({ locale, namespace: 'AdminAdult' });
  return { status: 'success', message: t('done') };
}

function text(formData: FormData, name: string): string | undefined {
  return String(formData.get(name) ?? '').trim() || undefined;
}

/** Approves or rejects the shared verification photo: the decision holds in the three apps. */
export async function verificationAction(
  locale: AppLocale,
  userId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const approve = formData.get('decision') === 'approve';
  return run(locale, formData, () =>
    decideAdultVerification(userId, approve, text(formData, 'note')?.slice(0, 300)),
  );
}

/** Withdraws the verification in the three apps (the person is emailed). */
export async function withdrawVerificationAction(
  locale: AppLocale,
  userId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(locale, formData, () =>
    withdrawAdultVerification(userId, text(formData, 'reason')?.slice(0, 500)),
  );
}

/** Starts a suspension that applies in the three apps (serious categories only). */
export async function suspendAction(
  locale: AppLocale,
  userId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'AdminAdult' });
  const category = parseSeriousCategory(formData.get('category'));
  const sourceApp = parseAdultApp(formData.get('sourceApp'));
  const duration = parseSharedDuration(formData.get('duration'));
  const reason = text(formData, 'reason');
  const fieldErrors: Record<string, string> = {};
  if (!category) fieldErrors.category = t('required');
  if (!sourceApp) fieldErrors.sourceApp = t('required');
  if (!duration) fieldErrors.duration = t('required');
  if (!reason) fieldErrors.reason = t('required');
  if (!category || !sourceApp || !duration || !reason) {
    return {
      status: 'error',
      fieldErrors,
      values: { reason: reason ?? '', duration: duration ?? '24h' },
    };
  }
  return run(locale, formData, () =>
    suspendAdultUser(userId, { category, sourceApp, reason: reason.slice(0, 500), duration }),
  );
}

/** Lifts the active shared suspension in the three apps, with a reason that is logged. */
export async function liftAction(
  locale: AppLocale,
  userId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const reason = text(formData, 'reason');
  if (!reason) {
    const t = await getTranslations({ locale, namespace: 'AdminAdult' });
    return { status: 'error', fieldErrors: { reason: t('required') } };
  }
  return run(locale, formData, () => liftAdultSuspension(userId, reason.slice(0, 500)));
}

/** "Review for all 18+ apps": makes an old per-app suspension shared. */
export async function shareReviewAction(
  locale: AppLocale,
  app: AdultApp,
  userId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(locale, formData, () => shareReviewSuspension(app, userId));
}

/** ...or leaves it in its app and drops it from the list. */
export async function keepReviewAction(
  locale: AppLocale,
  app: AdultApp,
  userId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(locale, formData, () => keepReviewSuspension(app, userId));
}

/** Deletes the keyed hash of an email after an accepted appeal (the team's action is logged). */
export async function deleteBannedEmailAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'AdminAdult' });
  const email = text(formData, 'email') ?? '';
  if (!EMAIL.test(email)) {
    return { status: 'error', fieldErrors: { email: t('bannedEmail.invalid') }, values: { email } };
  }
  try {
    await deleteBannedEmail(email);
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      return {
        status: 'error',
        fieldErrors: { email: t('bannedEmail.notFound') },
        values: { email },
      };
    }
    return failedState(error, locale, formData);
  }
  return { status: 'success', message: t('bannedEmail.done') };
}
