'use server';

import { getTranslations } from 'next-intl/server';
import { cruisingLocaleOrDefault } from '@/i18n/locale';
import { siteLocale } from '@/i18n/routing';
import { invalidState } from '@/lib/actions';
import { requestPasswordReset } from '@/lib/api/auth';
import { isApiError } from '@/lib/api/errors';
import { formString, type FormState } from '@/lib/forms';
import { forgotPasswordSchema } from '@/lib/schemas/auth';

/** Asks for a reset email. The answer is the same whether or not the account exists. */
export async function forgotPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = cruisingLocaleOrDefault(formData.get('locale'));
  const parsed = forgotPasswordSchema.safeParse({ email: formString(formData, 'email') });
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  const t = await getTranslations({ locale, namespace: 'ForgotPassword' });
  try {
    // The email and its link are the website's, in English or Spanish (decision 103).
    await requestPasswordReset({ email: parsed.data.email, locale: siteLocale(locale) });
  } catch (error) {
    const tc = await getTranslations({ locale, namespace: 'Common' });
    const rateLimited = isApiError(error) && error.status === 429;
    return {
      status: 'error',
      message: rateLimited ? t('rateLimited') : tc('genericError'),
      values: { email: parsed.data.email },
    };
  }
  return { status: 'success', message: t('sent') };
}
