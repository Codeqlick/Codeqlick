'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import { confirmPasswordReset } from '@/lib/api/auth';
import { isApiError } from '@/lib/api/errors';
import { clearAuthCookies } from '@/lib/auth/session';
import { formString, zodFieldErrors, type FormState } from '@/lib/forms';
import { resetPasswordSchema } from '@/lib/schemas/auth';

/**
 * Sets a new password with the token from the reset email, then sends the user to sign in.
 * The returned state never carries `values`: passwords are not echoed back into the form.
 */
export async function resetPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'ResetPassword' });

  const parsed = resetPasswordSchema.safeParse({
    newPassword: formData.get('newPassword') ?? '',
    confirmPassword: formData.get('confirmPassword') ?? '',
  });
  if (!parsed.success) {
    const tv = await getTranslations({ locale, namespace: 'Validation' });
    return { status: 'error', fieldErrors: zodFieldErrors(parsed.error, (key) => tv(key)) };
  }

  try {
    await confirmPasswordReset({
      token: formString(formData, 'token'),
      newPassword: parsed.data.newPassword,
    });
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 400) return { status: 'error', message: t('invalidLink') };
    if (status === 429) return { status: 'error', message: t('rateLimited') };
    const tc = await getTranslations({ locale, namespace: 'Common' });
    return { status: 'error', message: tc('genericError') };
  }

  // The API revoked every session of the account, including one this browser may hold.
  await clearAuthCookies();
  redirect(`/${locale}/login?reset=1`);
}
