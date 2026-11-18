'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { updateMe } from '@/lib/api/auth';
import { isApiError } from '@/lib/api/errors';
import type { FormState } from '@/lib/forms';

/**
 * The account site's own actions (architecture 6.5, decision 108): the language of the emails
 * and the optional emails.
 */

async function done(locale: AppLocale, work: () => Promise<unknown>): Promise<FormState> {
  const tc = await getTranslations({ locale, namespace: 'Common' });
  try {
    await work();
  } catch (error) {
    if (isApiError(error) && error.status === 401) redirect(`/${locale}/login`);
    return { status: 'error', message: tc('genericError') };
  }
  revalidatePath(`/${locale}`, 'layout');
  return { status: 'success', message: tc('saved') };
}

/** The language the platform writes to the person in (English or Spanish). */
export async function emailLanguageAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const value = formData.get('emailLocale') === 'es' ? 'es' : 'en';
  return done(locale, () => updateMe({ locale: value }));
}
