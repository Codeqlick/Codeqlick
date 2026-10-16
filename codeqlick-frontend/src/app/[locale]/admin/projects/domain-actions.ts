'use server';

import { revalidatePath } from 'next/cache';
import type { AppLocale } from '@/i18n/routing';
import { failedState, savedState } from '@/lib/actions';
import { adminCheckDomain, adminSaveDomain } from '@/lib/api/domains';
import { formText, type FormState } from '@/lib/forms';

function revalidateDomain(locale: AppLocale) {
  revalidatePath(`/${locale}/admin`, 'layout');
  revalidatePath(`/${locale}/portal`, 'layout');
}

export async function saveDomainAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const name =
    formText(formData, 'name')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/.*$/, '') || null;
  const picked = formText(formData, 'source');
  const source = picked === 'MANUAL' || picked === 'OVH' ? picked : 'RDAP';
  const expiresAt = formText(formData, 'expiresAt') || null;
  try {
    await adminSaveDomain(projectId, {
      name,
      source,
      expiresAt: source === 'MANUAL' ? expiresAt : undefined,
    });
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateDomain(locale);
  return savedState(locale);
}

export async function checkDomainAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminCheckDomain(projectId);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateDomain(locale);
  return { status: 'idle' };
}
