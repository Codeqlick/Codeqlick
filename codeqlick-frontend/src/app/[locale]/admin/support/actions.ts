'use server';

import { revalidatePath } from 'next/cache';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState, savedState } from '@/lib/actions';
import { adminReplyToTicket, adminUpdateTicket } from '@/lib/api/support';
import { formObject, type FormState } from '@/lib/forms';
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
