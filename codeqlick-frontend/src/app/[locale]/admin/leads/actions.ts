'use server';

import { revalidatePath } from 'next/cache';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState, savedState } from '@/lib/actions';
import { adminUpdateLead } from '@/lib/api/leads';
import { formString, formText, type FormState } from '@/lib/forms';
import { leadUpdateSchema } from '@/lib/schemas/admin';

export async function updateLeadAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = leadUpdateSchema.safeParse({
    status: formString(formData, 'status'),
    notes: formText(formData, 'notes'),
  });
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  try {
    await adminUpdateLead(id, parsed.data);
  } catch (error) {
    return failedState(error, locale, formData);
  }

  revalidatePath(`/${locale}/admin`, 'layout');
  return savedState(locale);
}
