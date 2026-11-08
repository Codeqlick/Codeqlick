'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { isApiError } from '@/lib/api/errors';
import { adminDeleteInvoice, adminSetInvoicePaid } from '@/lib/api/invoices';
import { failedState, unconfirmedDelete } from '@/lib/actions';
import type { FormState } from '@/lib/forms';

function revalidateInvoices(locale: AppLocale, projectId: string) {
  revalidatePath(`/${locale}/admin/projects/${projectId}`);
  revalidatePath(`/${locale}/portal`, 'layout');
}

/** Marks a team invoice paid, or not paid after a mistake. */
export async function setInvoicePaidAction(
  locale: AppLocale,
  projectId: string,
  invoiceId: string,
  paid: boolean,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminSetInvoicePaid(invoiceId, paid);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateInvoices(locale, projectId);
  const t = await getTranslations({ locale, namespace: 'Invoices' });
  return { status: 'success', message: paid ? t('markedPaid') : t('markedUnpaid') };
}

export async function deleteInvoiceAction(
  locale: AppLocale,
  projectId: string,
  invoiceId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const unconfirmed = await unconfirmedDelete(locale, formData);
  if (unconfirmed) return unconfirmed;
  try {
    await adminDeleteInvoice(invoiceId);
  } catch (error) {
    if (!(isApiError(error) && error.status === 404)) return failedState(error, locale, formData);
  }
  revalidateInvoices(locale, projectId);
  const t = await getTranslations({ locale, namespace: 'Invoices' });
  return { status: 'success', message: t('deleted') };
}
