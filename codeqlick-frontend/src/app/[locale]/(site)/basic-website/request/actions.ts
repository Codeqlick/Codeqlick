'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { localeOrDefault } from '@/i18n/locale';
import { isApiError } from '@/lib/api/errors';
import { createSiteRequest } from '@/lib/api/site-requests';
import { SITE_PRESETS } from '@/lib/api/types';
import { formObject, formString, formValues, zodFieldErrors, type FormState } from '@/lib/forms';

/** As the contact form: nobody fills this in under 3 seconds. */
const MIN_FILL_MS = 3000;

const optional = (max: number) => z.string().trim().max(max, 'tooLong');
const required = (max: number) => optional(max).min(1, 'required');

const schema = z.object({
  preset: z.enum(SITE_PRESETS, 'choice'),
  businessName: required(80),
  kind: required(80),
  city: required(80),
  address: optional(160),
  phone: optional(30),
  whatsapp: optional(30),
  businessEmail: z.union([z.literal(''), z.email('email').max(254)]),
  hours: optional(1000),
  services: optional(3000),
  about: optional(3000),
  domainChoice: z.enum(['new', 'owned', 'none'], 'choice').catch('none'),
  domainName: optional(253),
  name: required(120),
  email: z.email('email').max(254),
});
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const FIELDS = Object.keys(schema.shape);

const blank = (value: string) => value || undefined;

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
  const parsed = schema
    .superRefine((value, context) => {
      if (value.domainChoice === 'none') return;
      const domain = value.domainName.toLowerCase().replace(/^www\./, '');
      if (!DOMAIN.test(domain)) {
        context.addIssue({ code: 'custom', path: ['domainName'], message: 'domain' });
      }
    })
    .safeParse(formObject(formData, FIELDS));
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
      preset: d.preset,
      business: {
        name: d.businessName,
        kind: d.kind,
        city: d.city,
        address: blank(d.address),
        phone: blank(d.phone),
        whatsapp: blank(d.whatsapp),
        email: blank(d.businessEmail),
        hours: blank(d.hours),
        services: blank(d.services),
        about: blank(d.about),
      },
      ...(d.domainChoice === 'none'
        ? {}
        : {
            domain: {
              name: d.domainName.toLowerCase().replace(/^www\./, ''),
              owned: d.domainChoice === 'owned',
            },
          }),
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
