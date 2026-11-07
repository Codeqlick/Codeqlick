'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import { isApiError } from '@/lib/api/errors';
import { createCheckout } from '@/lib/api/site-requests';
import { formString, type FormState } from '@/lib/forms';

/** "Pagar": to Stripe Checkout, once the terms are accepted (architecture 8.2, decision 20). */
export async function buyWebsite(_previous: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'SiteRequest' });
  const slug = formString(formData, 'slug');
  if (formData.get('accept') !== 'on') {
    return {
      status: 'error',
      message: t('buyAcceptRequired'),
      fieldErrors: { accept: t('buyAcceptRequired') },
    };
  }
  let url: string;
  try {
    url = (await createCheckout(slug, locale)).url;
  } catch (error) {
    if (isApiError(error) && error.status === 409)
      return { status: 'error', message: t('buyTaken') };
    console.error('Checkout failed', error);
    return { status: 'error', message: t('buyError') };
  }
  redirect(url);
}
