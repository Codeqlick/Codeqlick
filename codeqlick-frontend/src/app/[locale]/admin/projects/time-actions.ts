'use server';

import { revalidatePath } from 'next/cache';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState } from '@/lib/actions';
import { adminDeleteTime, adminLogTime } from '@/lib/api/time';
import { formObject, type FormState } from '@/lib/forms';
import { timeEntrySchema } from '@/lib/schemas/admin';

function revalidateHours(locale: AppLocale) {
  revalidatePath(`/${locale}/admin`, 'layout');
  revalidatePath(`/${locale}/portal`, 'layout');
}

export async function logTimeAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = timeEntrySchema.safeParse(
    formObject(formData, ['date', 'minutes', 'description']),
  );
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  try {
    await adminLogTime(projectId, parsed.data);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateHours(locale);
  return { status: 'idle' };
}

export async function deleteTimeAction(
  locale: AppLocale,
  projectId: string,
  entryId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminDeleteTime(projectId, entryId);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateHours(locale);
  return { status: 'idle' };
}
