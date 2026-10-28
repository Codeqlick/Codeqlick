import 'server-only';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { z } from 'zod';
import type { AppLocale } from '@/i18n/routing';
import { isApiError } from '@/lib/api/errors';
import { formBoolean, formValues, zodFieldErrors, type FormState } from '@/lib/forms';

/** Helpers shared by the portal/admin Server Actions. */

/** Form state for a failed local (Zod) validation: translated field errors plus the echoed input. */
export async function invalidState(
  error: z.ZodError,
  locale: AppLocale,
  formData: FormData,
): Promise<FormState> {
  const tv = await getTranslations({ locale, namespace: 'Validation' });
  return {
    status: 'error',
    fieldErrors: zodFieldErrors(error, (key) => tv(key)),
    values: formValues(formData),
  };
}

/**
 * Form state for a failed API call. An expired session goes back to the login page; 4xx problems
 * show the API's own detail and field errors (`mapPath` renames API paths to input names).
 */
export async function failedState(
  error: unknown,
  locale: AppLocale,
  formData: FormData,
  mapPath: (path: string) => string = (path) => path,
): Promise<FormState> {
  if (isApiError(error) && error.status === 401) redirect(`/${locale}/login`);

  const tc = await getTranslations({ locale, namespace: 'Common' });
  const values = formValues(formData, ['password']);
  if (!isApiError(error) || error.status >= 500) {
    return { status: 'error', message: tc('genericError'), values };
  }
  return {
    status: 'error',
    message: error.detail ?? error.title,
    fieldErrors: Object.fromEntries(
      Object.entries(error.fieldErrors).map(([path, message]) => [mapPath(path), message]),
    ),
    values,
  };
}

/** A failed preview build request: past the daily cap, or without a builder, say so. */
export async function previewFailedState(
  error: unknown,
  locale: AppLocale,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Admin.previews' });
  if (isApiError(error) && error.status === 429) {
    return { ...(await failedState(error, locale, formData)), message: t('capReached') };
  }
  if (isApiError(error) && error.status === 503) {
    return { ...(await failedState(error, locale, formData)), message: t('noBuilder') };
  }
  return failedState(error, locale, formData);
}

/** Form state asking to tick the delete confirmation, or null when it is ticked. */
/** `expected`: the text DeleteForm's `confirmText` asked to type (case and spaces ignored). */
export async function unconfirmedDelete(
  locale: AppLocale,
  formData: FormData,
  expected?: string,
): Promise<FormState | null> {
  if (
    expected === undefined ? formBoolean(formData, 'confirm') : typed(formData) === norm(expected)
  )
    return null;
  const tv = await getTranslations({ locale, namespace: 'Validation' });
  return {
    status: 'error',
    fieldErrors: { confirm: expected === undefined ? tv('required') : tv('confirmMismatch') },
  };
}

const norm = (value: string) => value.trim().toLowerCase();
const typed = (formData: FormData) => {
  const value = formData.get('confirm');
  return typeof value === 'string' ? norm(value) : '';
};

export async function savedState(locale: AppLocale): Promise<FormState> {
  const tc = await getTranslations({ locale, namespace: 'Common' });
  return { status: 'success', message: tc('saved') };
}

/** Public pages cache API content for 5 minutes; drop it after an admin changes that content. */
export function revalidateSite() {
  revalidatePath('/', 'layout');
}
