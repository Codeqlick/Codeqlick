'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState, savedState } from '@/lib/actions';
import {
  adminBuildSite,
  adminCheckSiteDomain,
  adminCreateSite,
  adminRestoreSiteRevision,
  adminSaveSiteContent,
  adminUpdateSite,
} from '@/lib/api/managed-sites';
import { SITE_PRESETS } from '@/lib/api/types';
import { formObject, formText, type FormState } from '@/lib/forms';

const optionalDomain = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^https?:\/\//, '').replace(/\/.*$/, '') || null);

const createSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, 'slug'),
  preset: z.enum(SITE_PRESETS, 'choice'),
  domain: optionalDomain,
});

function revalidateSite(locale: AppLocale) {
  revalidatePath(`/${locale}/admin`, 'layout');
  revalidatePath(`/${locale}/portal`, 'layout');
}

export async function createSiteAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = createSchema.safeParse(formObject(formData, ['slug', 'preset', 'domain']));
  if (!parsed.success) return invalidState(parsed.error, locale, formData);
  try {
    await adminCreateSite(projectId, parsed.data);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateSite(locale);
  return { status: 'idle' };
}

export async function updateSiteDomainAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminUpdateSite(projectId, {
      domain: optionalDomain.parse(formText(formData, 'domain')),
    });
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateSite(locale);
  return savedState(locale);
}

/** The content as JSON, checked by the API against the template's `Site` type. */
export async function saveSiteContentAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = formText(formData, 'content');
  let content: unknown;
  try {
    content = JSON.parse(raw);
  } catch {
    const t = await getTranslations({ locale, namespace: 'ManagedSite' });
    return {
      status: 'error',
      fieldErrors: { content: t('invalidJson') },
      values: { content: raw },
    };
  }
  try {
    await adminSaveSiteContent(projectId, content);
  } catch (error) {
    // The API names the field inside the message (`content.theme.primary: …`).
    return failedState(error, locale, formData, () => 'content');
  }
  revalidateSite(locale);
  return savedState(locale);
}

export async function buildSiteAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminBuildSite(projectId);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateSite(locale);
  return { status: 'idle' };
}

export async function checkSiteDomainAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminCheckSiteDomain(projectId);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateSite(locale);
  return { status: 'idle' };
}

export async function restoreSiteRevisionAction(
  locale: AppLocale,
  projectId: string,
  revisionId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminRestoreSiteRevision(projectId, revisionId);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateSite(locale);
  return { status: 'idle' };
}
