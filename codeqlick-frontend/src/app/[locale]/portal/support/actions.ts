'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState } from '@/lib/actions';
import { closeMyTicket, openTicket, replyToMyTicket } from '@/lib/api/support';
import { formObject, type FormState } from '@/lib/forms';
import { ticketCreateSchema, ticketMessageSchema } from '@/lib/schemas/admin';

/** The portal and the admin panel both show the requests. */
function revalidateSupport(locale: AppLocale) {
  revalidatePath(`/${locale}/portal`, 'layout');
  revalidatePath(`/${locale}/admin`, 'layout');
}

export async function openTicketAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = ticketCreateSchema.safeParse(
    formObject(formData, ['type', 'priority', 'title', 'body', 'projectId']),
  );
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  let id: string;
  try {
    ({ id } = await openTicket(parsed.data));
  } catch (error) {
    return failedState(error, locale, formData);
  }

  revalidateSupport(locale);
  redirect(`/${locale}/portal/support/${id}`);
}

export async function replyToTicketAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = ticketMessageSchema.safeParse(formObject(formData, ['body']));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  try {
    await replyToMyTicket(id, parsed.data.body);
  } catch (error) {
    return failedState(error, locale, formData);
  }

  revalidateSupport(locale);
  return { status: 'idle' };
}

export async function closeTicketAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await closeMyTicket(id);
  } catch (error) {
    return failedState(error, locale, formData);
  }

  revalidateSupport(locale);
  return { status: 'idle' };
}
