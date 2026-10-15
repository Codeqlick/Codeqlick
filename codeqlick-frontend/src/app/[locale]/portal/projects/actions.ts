'use server';

import { revalidatePath } from 'next/cache';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState } from '@/lib/actions';
import { addUpdateComment, approveUpdate } from '@/lib/api/projects';
import { formObject, type FormState } from '@/lib/forms';
import { updateCommentSchema } from '@/lib/schemas/admin';

/** The portal and the admin panel both show the thread. */
function revalidateProject(locale: AppLocale) {
  revalidatePath(`/${locale}/portal`, 'layout');
  revalidatePath(`/${locale}/admin`, 'layout');
}

export async function commentAction(
  locale: AppLocale,
  id: string,
  updateId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = updateCommentSchema.safeParse(formObject(formData, ['body']));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  try {
    await addUpdateComment(id, updateId, parsed.data.body);
  } catch (error) {
    return failedState(error, locale, formData);
  }

  revalidateProject(locale);
  return { status: 'idle' };
}

export async function approveAction(
  locale: AppLocale,
  id: string,
  updateId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await approveUpdate(id, updateId);
  } catch (error) {
    return failedState(error, locale, formData);
  }

  revalidateProject(locale);
  return { status: 'idle' };
}
