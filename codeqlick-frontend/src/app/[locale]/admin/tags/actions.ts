'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState, revalidateSite, unconfirmedDelete } from '@/lib/actions';
import { isApiError } from '@/lib/api/errors';
import { adminCreateTag, adminDeleteTag, adminUpdateTag } from '@/lib/api/posts';
import { formString, formValues, type FormState } from '@/lib/forms';
import { tagFormSchema } from '@/lib/schemas/admin';

function parseTag(formData: FormData) {
  return tagFormSchema.safeParse({
    slug: formString(formData, 'slug'),
    nameEs: formString(formData, 'nameEs'),
    nameEn: formString(formData, 'nameEn'),
  });
}

/** The API's 409 (slug taken) as a field error in the user's language; other errors as usual. */
async function tagFailedState(error: unknown, locale: AppLocale, formData: FormData) {
  if (isApiError(error) && error.status === 409) {
    const t = await getTranslations({ locale, namespace: 'Admin.tags' });
    return {
      status: 'error',
      fieldErrors: { slug: t('slugTaken') },
      values: formValues(formData),
    } satisfies FormState;
  }
  return failedState(error, locale, formData);
}

function revalidateTags(locale: AppLocale) {
  // Tag names show on the public blog and in the post form.
  revalidateSite();
  revalidatePath(`/${locale}/admin/tags`);
}

export async function createTagAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseTag(formData);
  if (!parsed.success) return invalidState(parsed.error, locale, formData);
  try {
    await adminCreateTag(parsed.data);
  } catch (error) {
    return tagFailedState(error, locale, formData);
  }
  revalidateTags(locale);
  const t = await getTranslations({ locale, namespace: 'Admin.tags' });
  return { status: 'success', message: t('created') };
}

export async function updateTagAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = parseTag(formData);
  if (!parsed.success) return invalidState(parsed.error, locale, formData);
  try {
    await adminUpdateTag(id, parsed.data);
  } catch (error) {
    return tagFailedState(error, locale, formData);
  }
  revalidateTags(locale);
  const t = await getTranslations({ locale, namespace: 'Admin.tags' });
  return { status: 'success', message: t('saved'), values: formValues(formData) };
}

export async function deleteTagAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const unconfirmed = await unconfirmedDelete(locale, formData);
  if (unconfirmed) return unconfirmed;
  try {
    await adminDeleteTag(id);
  } catch (error) {
    // Already gone (deleted from another tab): refreshing the list is all that is left to do.
    if (!(isApiError(error) && error.status === 404)) return failedState(error, locale, formData);
  }
  revalidateTags(locale);
  return { status: 'success' };
}
