'use server';

import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import { isApiError, isDisposableEmailError } from '@/lib/api/errors';
import {
  confirmNewsletter,
  subscribeToNewsletter,
  unsubscribeFromNewsletter,
} from '@/lib/api/newsletter';
import { formObject, formString, formValues, zodFieldErrors, type FormState } from '@/lib/forms';
import { looksAutomated } from '@/lib/newsletter';
import { NEWSLETTER_FIELDS, newsletterSchema } from '@/lib/schemas/newsletter';

/** The sign-up box → POST /v1/newsletter. The API always answers 202, so success reveals nothing. */
export async function subscribeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Newsletter' });
  const tv = await getTranslations({ locale, namespace: 'Validation' });

  // Honeypot or too fast: bots get a success message and nothing is sent.
  if (
    looksAutomated({
      website: formString(formData, 'website'),
      renderedAt: formString(formData, 'renderedAt'),
      now: Date.now(),
    })
  ) {
    console.warn('Newsletter sign-up discarded as automated');
    return { status: 'success' };
  }

  const values = formValues(formData, ['website', 'locale', 'renderedAt', 'acceptPrivacy']);
  const parsed = newsletterSchema.safeParse(formObject(formData, NEWSLETTER_FIELDS));
  if (!parsed.success) {
    return {
      status: 'error',
      message: t('error'),
      fieldErrors: zodFieldErrors(parsed.error, (key) => tv(key)),
      values,
    };
  }

  try {
    await subscribeToNewsletter({ email: parsed.data.email, locale });
  } catch (error) {
    if (isDisposableEmailError(error)) {
      return { status: 'error', fieldErrors: { email: t('disposable') }, values };
    }
    if (isApiError(error) && error.status === 429) {
      return { status: 'error', message: t('rateLimited'), values };
    }
    return { status: 'error', message: t('failed'), values };
  }
  return { status: 'success' };
}

/** The unsubscribe page's button → POST /v1/newsletter/unsubscribe (a GET never unsubscribes). */
export async function unsubscribeAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Newsletter' });
  try {
    await unsubscribeFromNewsletter(formString(formData, 'token'));
  } catch (error) {
    return {
      status: 'error',
      message: isApiError(error) && error.status === 404 ? t('unsubscribeNotFound') : t('failed'),
    };
  }
  return { status: 'success' };
}

/**
 * The confirm page's button → POST /v1/newsletter/confirm. It takes a click, so a mail scanner
 * opening the link can't confirm a sign-up someone else made. An unknown or expired token comes
 * back as `values.expired`, which the page answers with the sign-up box.
 */
export async function confirmAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Newsletter' });
  try {
    await confirmNewsletter(formString(formData, 'token'));
  } catch (error) {
    if (isApiError(error) && error.status === 400) {
      return { status: 'error', message: t('confirmExpired'), values: { expired: '1' } };
    }
    return { status: 'error', message: t('failed') };
  }
  return { status: 'success' };
}
