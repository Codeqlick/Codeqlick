'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { AppLocale } from '@/i18n/routing';
import { invalidState, previewFailedState } from '@/lib/actions';
import { adminCreatePreview } from '@/lib/api/leads';
import { formObject, type FormState } from '@/lib/forms';
import { checkDomain, siteRequestFieldsSchema, toSiteRequest } from '@/lib/schemas/site-request';

const schema = siteRequestFieldsSchema.extend({
  name: z.string().trim().max(120, 'tooLong'),
  email: z.union([z.literal(''), z.email('email').max(254)]),
  locale: z.enum(['es', 'en']).catch('es'),
});
const FIELDS = Object.keys(schema.shape);

/** "Nueva vista previa": a prospect's preview, built without emailing anyone; opens its lead. */
export async function createPreviewAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = schema.superRefine(checkDomain).safeParse(formObject(formData, FIELDS));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);
  let leadId: string;
  try {
    ({ leadId } = await adminCreatePreview({
      ...toSiteRequest(parsed.data),
      name: parsed.data.name || undefined,
      email: parsed.data.email || undefined,
      locale: parsed.data.locale,
    }));
  } catch (error) {
    return previewFailedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin`, 'layout');
  redirect(`/${locale}/admin/leads/${leadId}`);
}
