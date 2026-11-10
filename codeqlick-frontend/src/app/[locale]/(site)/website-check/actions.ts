'use server';

import { getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { localeOrDefault } from '@/i18n/locale';
import { isApiError } from '@/lib/api/errors';
import { createSiteAudit } from '@/lib/api/site-audits';
import { formObject, formString, formValues, zodFieldErrors, type FormState } from '@/lib/forms';
import { WEBSITE_CHECK_FIELDS, websiteCheckSchema } from '@/lib/schemas/website-check';

/** Faster than a person types an address and an email: a bot (as on the contact form). */
const MIN_FILL_MS = 2000;

/** The free website check (architecture 4.12) → POST /v1/site-audits, then its report page. */
export async function requestWebsiteCheck(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'WebsiteCheck.form' });
  const tv = await getTranslations({ locale, namespace: 'Validation' });

  const renderedAt = Number(formString(formData, 'renderedAt'));
  if (
    formString(formData, 'website') !== '' ||
    !Number.isFinite(renderedAt) ||
    Date.now() - renderedAt < MIN_FILL_MS
  ) {
    console.warn('Website check request discarded as automated');
    return { status: 'success' };
  }

  const values = formValues(formData, ['website', 'locale', 'renderedAt', 'acceptPrivacy']);
  const parsed = websiteCheckSchema.safeParse(formObject(formData, WEBSITE_CHECK_FIELDS));
  if (!parsed.success) {
    return {
      status: 'error',
      message: t('error'),
      fieldErrors: zodFieldErrors(parsed.error, (key) => tv(key)),
      values,
    };
  }

  let id: string;
  try {
    ({ id } = await createSiteAudit({
      url: parsed.data.url,
      email: parsed.data.email,
      name: parsed.data.name || undefined,
      locale,
      acceptPrivacy: true,
    }));
  } catch (error) {
    if (isApiError(error) && error.status === 429) {
      return { status: 'error', message: t('rateLimited'), values };
    }
    if (isApiError(error) && error.status === 400) {
      return { status: 'error', message: t('error'), fieldErrors: { url: tv('website') }, values };
    }
    return { status: 'error', message: t('failed'), values };
  }
  redirect({ href: `/website-check/${id}`, locale });
  return { status: 'success' };
}
