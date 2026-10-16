'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState, unconfirmedDelete } from '@/lib/actions';
import {
  adminDeleteAllAccess,
  adminRevealAccess,
  deleteAccess,
  shareAccess,
} from '@/lib/api/credentials';
import { formObject, type FormState } from '@/lib/forms';
import { optionalUrl, requiredString } from '@/lib/schemas/common';

const accessSchema = z.object({
  label: requiredString(120),
  url: optionalUrl,
  username: z.string().trim().max(200, 'tooLong'),
  secret: z.string().min(1, 'required').max(5000, 'tooLong'),
  notes: z.string().trim().max(2000, 'tooLong'),
});

function revalidateAccess(locale: AppLocale) {
  revalidatePath(`/${locale}/portal`, 'layout');
  revalidatePath(`/${locale}/admin`, 'layout');
}

export async function shareAccessAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = accessSchema.safeParse(
    formObject(formData, ['label', 'url', 'username', 'secret', 'notes']),
  );
  // The secret never comes back to the browser, not even after an error.
  if (!parsed.success) {
    const state = await invalidState(parsed.error, locale, formData);
    return { ...state, values: { ...state.values, secret: '' } };
  }
  try {
    const { label, url, username, secret, notes } = parsed.data;
    await shareAccess(projectId, {
      label,
      url: url ?? undefined,
      username: username || undefined,
      secret,
      notes: notes || undefined,
    });
  } catch (error) {
    const state = await failedState(error, locale, formData);
    return { ...state, values: { ...state.values, secret: '' } };
  }
  revalidateAccess(locale);
  const t = await getTranslations({ locale, namespace: 'Access' });
  return { status: 'success', message: t('shared') };
}

export async function deleteAccessAction(
  locale: AppLocale,
  projectId: string,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await deleteAccess(projectId, id);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateAccess(locale);
  return { status: 'idle' };
}

/** The team opens one: the secret goes back in the state, shown once by AccessReveal. */
export async function revealAccessAction(
  locale: AppLocale,
  projectId: string,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    const { secret, notes } = await adminRevealAccess(projectId, id);
    revalidateAccess(locale);
    return { status: 'idle', values: { revealedSecret: secret, revealedNotes: notes ?? '' } };
  } catch (error) {
    return failedState(error, locale, formData);
  }
}

export async function deleteAllAccessAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const unconfirmed = await unconfirmedDelete(locale, formData);
  if (unconfirmed) return unconfirmed;
  try {
    await adminDeleteAllAccess(projectId);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateAccess(locale);
  return { status: 'idle' };
}
