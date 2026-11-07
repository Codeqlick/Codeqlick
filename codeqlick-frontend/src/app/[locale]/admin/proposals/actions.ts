'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState, savedState, unconfirmedDelete } from '@/lib/actions';
import {
  adminCreateProposal,
  adminDeleteProposal,
  adminDuplicateProposal,
  adminSendProposal,
  adminUpdateProposal,
  adminWithdrawProposal,
} from '@/lib/api/proposals';
import { formObject, type FormState } from '@/lib/forms';
import { proposalCreateSchema, proposalFormSchema } from '@/lib/schemas/admin';

const FIELDS = ['title', 'summary', 'terms', 'validUntil', 'projectId'] as const;

/** The item rows of the form: one `itemDescription`/`itemQuantity`/`itemPrice` per row. */
function formItems(formData: FormData) {
  const text = (name: string) =>
    formData.getAll(name).map((value) => (typeof value === 'string' ? value : ''));
  const prices = text('itemPrice');
  const quantities = text('itemQuantity');
  // Every row counts, empty ones too: error keys like `items.2.unitPrice` point at the row.
  return text('itemDescription').map((description, index) => ({
    description,
    quantity: quantities[index] ?? '',
    unitPrice: prices[index] ?? '',
  }));
}

function revalidateProposals(locale: AppLocale) {
  revalidatePath(`/${locale}/admin`, 'layout');
  revalidatePath(`/${locale}/portal`, 'layout');
}

export async function createProposalAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = proposalCreateSchema.safeParse({
    ...formObject(formData, [...FIELDS, 'clientId']),
    items: formItems(formData),
  });
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  let id: string;
  try {
    ({ id } = await adminCreateProposal(parsed.data));
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateProposals(locale);
  redirect(`/${locale}/admin/proposals/${id}`);
}

export async function updateProposalAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = proposalFormSchema.safeParse({
    ...formObject(formData, FIELDS),
    items: formItems(formData),
  });
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  try {
    await adminUpdateProposal(id, parsed.data);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateProposals(locale);
  return savedState(locale);
}

export async function sendProposalAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let clientNotified: boolean;
  try {
    ({ clientNotified } = await adminSendProposal(id));
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateProposals(locale);
  // The send panel goes away with the draft: the page shows the outcome instead.
  redirect(`/${locale}/admin/proposals/${id}?sent=${clientNotified ? 'email' : 'noEmail'}`);
}

export async function withdrawProposalAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminWithdrawProposal(id);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateProposals(locale);
  return { status: 'idle' };
}

export async function duplicateProposalAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let copyId: string;
  try {
    ({ id: copyId } = await adminDuplicateProposal(id));
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateProposals(locale);
  redirect(`/${locale}/admin/proposals/${copyId}`);
}

export async function deleteProposalAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const unconfirmed = await unconfirmedDelete(locale, formData);
  if (unconfirmed) return unconfirmed;
  try {
    await adminDeleteProposal(id);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateProposals(locale);
  redirect(`/${locale}/admin/proposals`);
}
