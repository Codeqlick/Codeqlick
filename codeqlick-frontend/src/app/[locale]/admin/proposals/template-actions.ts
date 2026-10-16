'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState } from '@/lib/actions';
import { adminDeleteProposalTemplate, adminSaveProposalAsTemplate } from '@/lib/api/proposals';
import { formObject, type FormState } from '@/lib/forms';
import { requiredString } from '@/lib/schemas/common';

const nameSchema = z.object({ name: requiredString(80) });

export async function saveAsTemplateAction(
  locale: AppLocale,
  proposalId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = nameSchema.safeParse(formObject(formData, ['name']));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);
  try {
    await adminSaveProposalAsTemplate(proposalId, parsed.data.name);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin/proposals`, 'layout');
  const t = await getTranslations({ locale, namespace: 'Admin.proposals' });
  return { status: 'success', message: t('templateSaved') };
}

export async function deleteTemplateAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminDeleteProposalTemplate(id);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin/proposals`, 'layout');
  return { status: 'idle' };
}
