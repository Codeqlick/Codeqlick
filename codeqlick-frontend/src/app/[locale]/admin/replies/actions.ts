'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState, savedState, unconfirmedDelete } from '@/lib/actions';
import { isApiError } from '@/lib/api/errors';
import {
  adminCreateSavedReply,
  adminDeleteSavedReply,
  adminUpdateSavedReply,
} from '@/lib/api/saved-replies';
import { formObject, type FormState } from '@/lib/forms';
import { savedReplySchema } from '@/lib/schemas/admin';

/** Every admin page with a reply box offers them. */
function revalidateAdmin(locale: AppLocale) {
  revalidatePath(`/${locale}/admin`, 'layout');
}

export async function createSavedReplyAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = savedReplySchema.safeParse(formObject(formData, ['title', 'body']));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);
  try {
    await adminCreateSavedReply(parsed.data);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateAdmin(locale);
  const t = await getTranslations({ locale, namespace: 'Admin.savedReplies' });
  return { status: 'success', message: t('created') };
}

export async function updateSavedReplyAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = savedReplySchema.safeParse(formObject(formData, ['title', 'body']));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);
  try {
    await adminUpdateSavedReply(id, parsed.data);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateAdmin(locale);
  return savedState(locale);
}

export async function deleteSavedReplyAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const unconfirmed = await unconfirmedDelete(locale, formData);
  if (unconfirmed) return unconfirmed;
  try {
    await adminDeleteSavedReply(id);
  } catch (error) {
    if (!(isApiError(error) && error.status === 404)) return failedState(error, locale, formData);
  }
  revalidateAdmin(locale);
  return { status: 'idle' };
}
