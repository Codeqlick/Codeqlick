'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { localeOrDefault } from '@/i18n/locale';
import { isApiError } from '@/lib/api/errors';
import { createSiteRequest } from '@/lib/api/site-requests';
import { checkDomain, siteRequestFieldsSchema, toSiteRequest } from '@/lib/schemas/site-request';
import { formObject, formString, formValues, zodFieldErrors, type FormState } from '@/lib/forms';

/** As the contact form: nobody fills this in under 3 seconds. */
const MIN_FILL_MS = 3000;

const schema = siteRequestFieldsSchema.extend({
  name: z.string().trim().max(120, 'tooLong').min(1, 'required'),
  email: z.email('email').max(254),
});
const FIELDS = Object.keys(schema.shape);

export async function submitSiteRequest(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'SiteRequest' });
  const tv = await getTranslations({ locale, namespace: 'Validation' });

  const renderedAt = Number(formString(formData, 'renderedAt'));
  if (
    formString(formData, 'website') !== '' ||
    !Number.isFinite(renderedAt) ||
    Date.now() - renderedAt < MIN_FILL_MS
  ) {
    console.warn('Site request discarded as automated');
    redirect(`/${locale}/basic-website/request?sent=1`);
  }

  const values = formValues(formData, ['website', 'locale', 'renderedAt']);
  const parsed = schema.superRefine(checkDomain).safeParse(formObject(formData, FIELDS));
  if (!parsed.success) {
    return {
      status: 'error',
      message: t('error'),
      fieldErrors: zodFieldErrors(parsed.error, (key) => tv(key)),
      values,
    };
  }
  const d = parsed.data;
  let preview = '';
  try {
    const created = await createSiteRequest({
      ...toSiteRequest(d),
      name: d.name,
      email: d.email,
      locale,
    });
    // Only the preview's name travels in the URL; the page rebuilds its address.
    preview = created.previewUrl ? new URL(created.previewUrl).hostname.split('.')[0]! : '';
  } catch (error) {
    const message = isApiError(error) && error.status === 429 ? t('rateLimited') : t('error');
    return { status: 'error', message, values };
  }
  redirect(`/${locale}/basic-website/request?sent=1${preview ? `&preview=${preview}` : ''}`);
}
