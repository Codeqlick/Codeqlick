'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import {
  failedState,
  invalidState,
  previewFailedState,
  savedState,
  unconfirmedDelete,
} from '@/lib/actions';
import { isApiError } from '@/lib/api/errors';
import { z } from 'zod';
import {
  adminConvertLead,
  adminDeleteLead,
  adminEditLeadRequest,
  adminProposeFromRequest,
  adminRebuildLeadPreview,
  adminRemoveLeadPreview,
  adminReplyToLead,
  adminUpdateLead,
} from '@/lib/api/leads';
import { formObject, formString, formText, type FormState } from '@/lib/forms';
import { leadReplySchema, leadUpdateSchema } from '@/lib/schemas/admin';
import { checkDomain, siteRequestFieldsSchema, toSiteRequest } from '@/lib/schemas/site-request';

const REQUEST_FIELDS = Object.keys(siteRequestFieldsSchema.shape);

const contactSchema = z.object({
  name: z.string().trim().min(1, 'required').max(120, 'tooLong'),
  email: z.union([z.literal(''), z.email('email').max(254)]),
  company: z.string().trim().max(160, 'tooLong'),
});

export async function updateLeadAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = leadUpdateSchema.safeParse({
    status: formString(formData, 'status'),
    notes: formText(formData, 'notes'),
    lostReason: formString(formData, 'lostReason'),
    followUpOn: formString(formData, 'followUpOn'),
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
  let email: string | null;
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
  return { status: 'success', message: t('replySent', { email: email ?? '' }) };
}

export async function convertLeadAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const projectName = formString(formData, 'projectName').trim().slice(0, 200) || undefined;
  let projectId: string;
  try {
    ({
      project: { id: projectId },
    } = await adminConvertLead(id, { projectName }));
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin`, 'layout');
  redirect(`/${locale}/admin/projects/${projectId}`);
}

/** The contact details, corrected by the team (an empty email only for a prospect). */
export async function updateLeadContactAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = contactSchema.safeParse(formObject(formData, ['name', 'email', 'company']));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);
  try {
    await adminUpdateLead(id, {
      name: parsed.data.name,
      email: parsed.data.email || null,
      company: parsed.data.company || null,
    });
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin`, 'layout');
  return savedState(locale);
}

/** Replaces the lead's website request; its preview is rebuilt from it. */
export async function editLeadRequestAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = siteRequestFieldsSchema
    .superRefine(checkDomain)
    .safeParse(formObject(formData, REQUEST_FIELDS));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);
  try {
    await adminEditLeadRequest(id, toSiteRequest(parsed.data));
  } catch (error) {
    return previewFailedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin`, 'layout');
  const t = await getTranslations({ locale, namespace: 'Admin.leads' });
  return { status: 'success', message: t('requestSaved') };
}

/** Builds the preview again (a new address when it was taken down); nobody is emailed. */
export async function rebuildLeadPreviewAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminRebuildLeadPreview(id);
  } catch (error) {
    return previewFailedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin`, 'layout');
  return { status: 'idle' };
}

export async function deleteLeadAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const unconfirmed = await unconfirmedDelete(locale, formData);
  if (unconfirmed) return unconfirmed;
  try {
    await adminDeleteLead(id);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin`, 'layout');
  redirect(`/${locale}/admin/leads`);
}

export async function removeLeadPreviewAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminRemoveLeadPreview(id);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin`, 'layout');
  return { status: 'idle' };
}

/** "Preparar propuesta": drafts the request's proposal and opens it to review. */
export async function proposeFromRequestAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let proposalId: string;
  try {
    ({ proposalId } = await adminProposeFromRequest(id));
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin`, 'layout');
  redirect(`/${locale}/admin/proposals/${proposalId}`);
}
