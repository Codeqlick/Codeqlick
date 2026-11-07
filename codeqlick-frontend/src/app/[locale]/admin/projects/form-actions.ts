'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import type { AppLocale } from '@/i18n/routing';
import { failedState, savedState } from '@/lib/actions';
import { adminReplaceSiteFormKey, adminSaveSiteForm } from '@/lib/api/site-forms';
import { formBoolean, formText, type FormState } from '@/lib/forms';

const recipientsSchema = z.array(z.email().max(254)).min(1).max(5);

export async function saveSiteFormAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const raw = formText(formData, 'recipients');
  const parsed = recipientsSchema.safeParse(
    raw
      .split(/[,;\s]+/)
      .map((email) => email.trim())
      .filter(Boolean),
  );
  if (!parsed.success) {
    const t = await getTranslations({ locale, namespace: 'SiteForm' });
    return {
      status: 'error',
      fieldErrors: { recipients: t('invalidEmails') },
      values: { recipients: raw },
    };
  }
  try {
    await adminSaveSiteForm(projectId, {
      enabled: formBoolean(formData, 'enabled'),
      recipients: parsed.data,
    });
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin`, 'layout');
  return savedState(locale);
}

export async function replaceSiteFormKeyAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminReplaceSiteFormKey(projectId);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin`, 'layout');
  return { status: 'idle' };
}
