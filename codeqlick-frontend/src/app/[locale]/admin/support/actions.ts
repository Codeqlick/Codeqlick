'use server';

import { revalidatePath } from 'next/cache';
import type { AppLocale } from '@/i18n/routing';
import { getTranslations } from 'next-intl/server';
import { failedState, invalidState, savedState, unconfirmedDelete } from '@/lib/actions';
import { isApiError } from '@/lib/api/errors';
import { adminDeleteTicketFile, adminReplyToTicket, adminUpdateTicket } from '@/lib/api/support';
import { adminTaskFromTicket } from '@/lib/api/tasks';
import { formObject, formString, type FormState } from '@/lib/forms';
import { adminTicketMessageSchema, adminTicketUpdateSchema } from '@/lib/schemas/admin';

function revalidateSupport(locale: AppLocale) {
  revalidatePath(`/${locale}/admin`, 'layout');
  revalidatePath(`/${locale}/portal`, 'layout');
}

export async function adminReplyToTicketAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = adminTicketMessageSchema.safeParse(formObject(formData, ['body', 'status']));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  try {
    await adminReplyToTicket(id, parsed.data);
  } catch (error) {
    return failedState(error, locale, formData);
  }

  revalidateSupport(locale);
  return { status: 'idle' };
}

export async function adminUpdateTicketAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = adminTicketUpdateSchema.safeParse(formObject(formData, ['status', 'priority']));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  try {
    await adminUpdateTicket(id, parsed.data);
  } catch (error) {
    return failedState(error, locale, formData);
  }

  revalidateSupport(locale);
  return savedState(locale);
}

export async function adminDeleteTicketFileAction(
  locale: AppLocale,
  id: string,
  fileId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const unconfirmed = await unconfirmedDelete(locale, formData);
  if (unconfirmed) return unconfirmed;

  try {
    await adminDeleteTicketFile(id, fileId);
  } catch (error) {
    // Already gone (deleted from another tab): refreshing the list is all that is left to do.
    if (!(isApiError(error) && error.status === 404)) return failedState(error, locale, formData);
  }

  revalidateSupport(locale);
  const t = await getTranslations({ locale, namespace: 'Support' });
  return { status: 'success', message: t('fileDeleted') };
}

export async function taskFromTicketAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const projectId = formString(formData, 'projectId') || undefined;
  try {
    await adminTaskFromTicket(id, { projectId });
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateSupport(locale);
  const t = await getTranslations({ locale, namespace: 'Tasks' });
  return { status: 'success', message: t('createdFromRequest') };
}
