'use server';

import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import {
  confirmCloudStatusSubscription,
  subscribeToCloudStatus,
  unsubscribeFromCloudStatus,
} from '@/lib/api/cloud';
import { isApiError, isDisposableEmailError } from '@/lib/api/errors';
import { formObject, formString, formValues, zodFieldErrors, type FormState } from '@/lib/forms';
import { looksAutomated } from '@/lib/newsletter';
import { NEWSLETTER_FIELDS, newsletterSchema } from '@/lib/schemas/newsletter';

/**
 * A status page's "Get updates by email" → POST /v1/cloud/status/:team/subscribers (architecture
 * 4.13, decision 105). The API answers 202 for any address, so success reveals nothing.
 */
export async function subscribeToStatusAction(
  team: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Cloud.subscribe' });
  const tv = await getTranslations({ locale, namespace: 'Validation' });

  // The same bot checks as the newsletter: bots get a success message and nothing is sent.
  if (
    looksAutomated({
      website: formString(formData, 'website'),
      renderedAt: formString(formData, 'renderedAt'),
      now: Date.now(),
    })
  ) {
    console.warn('Status page sign-up discarded as automated');
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
    await subscribeToCloudStatus(team, {
      email: parsed.data.email,
      locale: locale === 'es' ? 'es' : 'en',
    });
  } catch (error) {
    if (isDisposableEmailError(error)) {
      return { status: 'error', fieldErrors: { email: t('disposable') }, values };
    }
    if (isApiError(error) && error.status === 409) {
      return { status: 'error', message: t('full'), values };
    }
    if (isApiError(error) && error.status === 404) {
      return { status: 'error', message: t('closed'), values };
    }
    if (isApiError(error) && error.status === 429) {
      return { status: 'error', message: t('rateLimited'), values };
    }
    return { status: 'error', message: t('failed'), values };
  }
  return { status: 'success' };
}

/**
 * The confirm page's button → POST /v1/cloud/status-subscribers/confirm. A click, so a mail
 * scanner opening the link can't confirm a sign-up someone else made. The team's slug comes back
 * in `values.team` for the link to its page.
 */
export async function confirmStatusAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Cloud.statusUpdates' });
  try {
    const result = await confirmCloudStatusSubscription(formString(formData, 'token'));
    return { status: 'success', values: { team: result.teamSlug, teamName: result.teamName } };
  } catch (error) {
    if (isApiError(error) && error.status === 400) {
      return { status: 'error', message: t('confirmExpired') };
    }
    return { status: 'error', message: t('failed') };
  }
}

/** The unsubscribe page's button → POST /v1/cloud/status-subscribers/unsubscribe. */
export async function unsubscribeStatusAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Cloud.statusUpdates' });
  try {
    const result = await unsubscribeFromCloudStatus(formString(formData, 'token'));
    return { status: 'success', values: { team: result.teamSlug, teamName: result.teamName } };
  } catch (error) {
    return {
      status: 'error',
      message: isApiError(error) && error.status === 404 ? t('unsubscribeNotFound') : t('failed'),
    };
  }
}
