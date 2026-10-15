'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState, savedState } from '@/lib/actions';
import { isApiError } from '@/lib/api/errors';
import { adminReplyToLead, adminUpdateLead } from '@/lib/api/leads';
import { formString, formText, type FormState } from '@/lib/forms';
import { leadReplySchema, leadUpdateSchema } from '@/lib/schemas/admin';

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

export async function replyToLeadAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = leadReplySchema.safeParse({
    subject: formString(formData, 'subject'),
    body: formData.get('body') ?? '',
  });
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  const t = await getTranslations({ locale, namespace: 'Admin.leads' });
  let email: string;
  try {
    ({
      lead: { email },
    } = await adminReplyToLead(id, parsed.data));
  } catch (error) {
    if (isApiError(error) && error.status === 503) {
      // Keep what was written: nothing was sent.
      return { ...(await failedState(error, locale, formData)), message: t('replyFailed') };
    }
    return failedState(error, locale, formData);
  }

  revalidatePath(`/${locale}/admin`, 'layout');
  return { status: 'success', message: t('replySent', { email }) };
}
