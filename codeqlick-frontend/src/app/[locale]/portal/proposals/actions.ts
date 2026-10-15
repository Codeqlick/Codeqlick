'use server';

import { revalidatePath } from 'next/cache';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState } from '@/lib/actions';
import { acceptProposal, declineProposal } from '@/lib/api/proposals';
import { formObject, type FormState } from '@/lib/forms';
import { proposalAcceptSchema, proposalDeclineSchema } from '@/lib/schemas/admin';

function revalidateProposals(locale: AppLocale) {
  revalidatePath(`/${locale}/portal`, 'layout');
  revalidatePath(`/${locale}/admin`, 'layout');
}

export async function acceptProposalAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = proposalAcceptSchema.safeParse(formObject(formData, ['name', 'confirm']));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  try {
    await acceptProposal(id, parsed.data.name);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateProposals(locale);
  return { status: 'idle' };
}

export async function declineProposalAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = proposalDeclineSchema.safeParse(formObject(formData, ['reason']));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  try {
    await declineProposal(id, parsed.data.reason);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateProposals(locale);
  return { status: 'idle' };
}
