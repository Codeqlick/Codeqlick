'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { routing, type AppLocale } from '@/i18n/routing';
import { failedState } from '@/lib/actions';
import {
  actOnCruisingReport,
  approveCruisingSpot,
  decideCruisingTakedown,
  dismissCruisingReport,
  hideCruisingSpot,
  liftCruisingSuspension,
  patchAdminCruisingSpot,
  rejectCruisingSpot,
} from '@/lib/api/cruising';
import { LIMITS, parseSpotForm, SUSPENSIONS, type CruisingSuspension } from '@/lib/cruising';
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
  revalidatePath(`/${locale}/admin/cruising`);
  // A published, hidden or removed spot changes what the public pages show, in both languages.
  for (const each of routing.locales) revalidatePath(`/${each}/cruising`, 'layout');
  const t = await getTranslations({ locale, namespace: 'AdminCruising' });
  return { status: 'success', message: t('done') };
}

function text(formData: FormData, name: string): string | undefined {
  return String(formData.get(name) ?? '').trim() || undefined;
}

function suspension(formData: FormData): CruisingSuspension | null {
  const value = formData.get('suspend');
  return SUSPENSIONS.find((duration) => duration === value) ?? null;
}

/** Publishes, rejects (with the reason the proposer is emailed) or hides a spot. */
export async function spotAction(
  locale: AppLocale,
  spotId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const decision = formData.get('decision');
  if (decision === 'approve') return run(locale, formData, () => approveCruisingSpot(spotId));
  if (decision === 'hide') return run(locale, formData, () => hideCruisingSpot(spotId));
  const t = await getTranslations({ locale, namespace: 'AdminCruising' });
  const reason = text(formData, 'reason') ?? '';
  if (reason.length < 5) {
    return {
      status: 'error',
      fieldErrors: { reason: t('reasonNeeded') },
      values: { reason },
    };
  }
  return run(locale, formData, () =>
    rejectCruisingSpot(spotId, reason.slice(0, LIMITS.rejectReason)),
  );
}

/** The team's corrections to a spot before it is published (the slug stays). */
export async function editSpotAction(
  locale: AppLocale,
  spotId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Cruising.spotForm' });
  const { values, errors, data } = parseSpotForm(formData, true);
  if (Object.keys(errors).length > 0) {
    return {
      status: 'error',
      fieldErrors: Object.fromEntries(
        Object.entries(errors).map(([field, key]) => [field, t(`errors.${key!}`)]),
      ),
      values,
    };
  }
  return run(locale, formData, () => patchAdminCruisingSpot(spotId, data));
}

/** Dismisses a report, or acts: removes the spot or review and optionally suspends the person. */
export async function reportAction(
  locale: AppLocale,
  reportId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  if (formData.get('decision') === 'dismiss') {
    return run(locale, formData, () => dismissCruisingReport(reportId));
  }
  return run(locale, formData, () =>
    actOnCruisingReport(reportId, {
      remove: formData.get('remove') === 'on',
      suspend: suspension(formData),
      reason: text(formData, 'reason')?.slice(0, LIMITS.rejectReason),
    }),
  );
}

/** Answers a removal request: removes the spot (it becomes REJECTED) or closes it (restores). */
export async function takedownAction(
  locale: AppLocale,
  takedownId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const remove = formData.get('decision') === 'remove';
  // Left empty, the email to the person says the decision in their own language.
  const response = text(formData, 'response');
  return run(locale, formData, () => decideCruisingTakedown(takedownId, remove, response));
}

export async function liftAction(
  locale: AppLocale,
  userId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  return run(locale, formData, () => liftCruisingSuspension(userId));
}
