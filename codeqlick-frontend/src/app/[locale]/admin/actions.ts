'use server';

import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/routing';
import { isApiError } from '@/lib/api/errors';
import { adminUploadImage, MAX_IMAGE_BYTES } from '@/lib/api/media';
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
