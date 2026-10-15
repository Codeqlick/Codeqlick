'use server';

import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
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
  const locale = localeOrDefault(formData.get('locale'));
  const parsed = forgotPasswordSchema.safeParse({ email: formString(formData, 'email') });
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  const t = await getTranslations({ locale, namespace: 'ForgotPassword' });
  try {
    await requestPasswordReset({ email: parsed.data.email, locale });
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
