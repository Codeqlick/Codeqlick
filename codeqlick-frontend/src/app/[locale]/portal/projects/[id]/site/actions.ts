'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { failedState } from '@/lib/actions';
import { isApiError } from '@/lib/api/errors';
import {
  getMySite,
  getSiteEditor,
  saveMySite,
  saveSiteDraft,
  setMySiteDomain,
} from '@/lib/api/portal-site';
import { formValues, type FormState } from '@/lib/forms';

/** The trimmed text of a field, or undefined when empty. */
function text(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** The client chooses, changes or (empty) drops their own domain. */
export async function setSiteDomainAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'PortalSite' });
  const values = formValues(formData);
  const raw =
    text(formData, 'domainName')
      ?.toLowerCase()
      .replace(/^www\./, '') ?? null;
  if (raw && !DOMAIN.test(raw)) {
    return { status: 'error', fieldErrors: { domainName: t('domainInvalid') }, values };
  }
  try {
    await setMySiteDomain(projectId, raw);
  } catch (error) {
    if (isApiError(error) && (error.status === 409 || error.status === 400)) {
      const message = error.status === 409 ? t('domainInUse') : t('domainReserved');
      return { status: 'error', fieldErrors: { domainName: message }, values };
    }
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/portal`, 'layout');
  return { status: 'success', message: raw ? t('domainSaved') : t('domainRemoved') };
}

/** Puts hola@<domain> as the site's contact email and publishes it. */
export async function applyDomainEmailAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'PortalSite' });
  try {
    const site = await getMySite(projectId);
    if (!site.domain.name) return { status: 'idle' };
    const address = `hola@${site.domain.name}`;
    await saveMySite(projectId, {
      ...site.editable,
      contact: { ...site.editable.contact, email: address },
    });
    // A draft in the editor keeps its own copy: it gets the address too.
    const editor = await getSiteEditor(projectId);
    if (editor.draft) {
      const content = editor.content as { contact?: Record<string, unknown> };
      await saveSiteDraft(projectId, {
        content: { ...content, contact: { ...content.contact, email: address } },
      });
    }
    revalidatePath(`/${locale}/portal`, 'layout');
    return { status: 'success', message: t('mailUsed', { address }) };
  } catch (error) {
    return failedState(error, locale, formData);
  }
}
