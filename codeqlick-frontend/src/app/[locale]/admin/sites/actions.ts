'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState } from '@/lib/actions';
import { adminOnboardSite } from '@/lib/api/managed-sites';
import { SITE_PRESETS } from '@/lib/api/types';
import { formObject, type FormState } from '@/lib/forms';
import { requiredString } from '@/lib/schemas/common';

const onboardSchema = z.object({
  name: requiredString(120),
  email: z.email('email').max(254),
  locale: z.enum(['es', 'en'], 'choice'),
  businessName: requiredString(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, 'slug'),
  preset: z.enum(SITE_PRESETS, 'choice'),
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => value.replace(/^https?:\/\//, '').replace(/\/.*$/, '') || null),
  leadId: z
    .string()
    .trim()
    .transform((value) => value || undefined),
});

const FIELDS = ['name', 'email', 'locale', 'businessName', 'slug', 'preset', 'domain', 'leadId'];

export async function onboardSiteAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = onboardSchema.safeParse(formObject(formData, FIELDS));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);
  let projectId: string;
  try {
    ({ projectId } = await adminOnboardSite(parsed.data));
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin`, 'layout');
  redirect(`/${locale}/admin/projects/${projectId}#site`);
}
