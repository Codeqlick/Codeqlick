'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/routing';
import { isApiError } from '@/lib/api/errors';
import { failedState, unconfirmedDelete } from '@/lib/actions';
import { adminDeleteMedia, adminUploadImage, MAX_IMAGE_BYTES } from '@/lib/api/media';
import type { FormState } from '@/lib/forms';
import { absoluteUrl } from '@/lib/seo';

export type UploadImageResult = { url: string } | { error: string };

/** Uploads one image (form field `file`) and returns the public URL it is served from. */
export async function uploadImageAction(
  locale: AppLocale,
  formData: FormData,
): Promise<UploadImageResult> {
  const t = await getTranslations({ locale, namespace: 'Admin.media' });
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: t('missing') };
  if (file.size > MAX_IMAGE_BYTES) return { error: t('tooLarge') };

  try {
    const { filename } = await adminUploadImage(file);
    return { url: absoluteUrl(`/media/${filename}`) };
  } catch (error) {
    if (isApiError(error) && error.status === 401) redirect(`/${locale}/login`);
    if (isApiError(error) && error.status === 413) return { error: t('tooLarge') };
    if (isApiError(error) && error.status === 400) return { error: t('unsupported') };
    return { error: t('failed') };
  }
}

/** Deletes an uploaded image from the media library. The API refuses while content still uses it. */
export async function deleteImageAction(
  locale: AppLocale,
  filename: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const unconfirmed = await unconfirmedDelete(locale, formData);
  if (unconfirmed) return unconfirmed;

  const t = await getTranslations({ locale, namespace: 'Admin.media' });
  try {
    await adminDeleteMedia(filename);
  } catch (error) {
    if (isApiError(error) && error.status === 409) return { status: 'error', message: t('inUse') };
    // Already gone (deleted from another tab): refreshing the list is all that is left to do.
    if (!(isApiError(error) && error.status === 404)) return failedState(error, locale, formData);
  }

  revalidatePath(`/${locale}/admin/media`);
  return { status: 'success', message: t('deleted') };
}
