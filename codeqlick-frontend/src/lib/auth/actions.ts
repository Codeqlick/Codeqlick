'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import type { AppLocale } from '@/i18n/routing';
import { changePassword, logout } from '@/lib/api/auth';
import { isApiError } from '@/lib/api/errors';
import { zodFieldErrors, type FormState } from '@/lib/forms';
import { changePasswordSchema } from '@/lib/schemas/auth';
import { clearAuthCookies, getTokens } from './session';

/** POST /auth/logout with the refresh token (best effort), clear cookies, go home. */
export async function logoutAction(formData: FormData): Promise<void> {
  const locale = localeOrDefault(formData.get('locale'));

  const { refreshToken } = await getTokens();
  if (refreshToken) {
    try {
      await logout(refreshToken);
    } catch {
      // The session may already be revoked or expired; clearing cookies is what matters.
    }
  }
  await clearAuthCookies();
  redirect(`/${locale}`);
}

/**
 * Changes the signed-in user's password. The returned state never carries `values`: passwords
 * are not echoed back into the form.
 */
export async function changePasswordAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get('currentPassword') ?? '',
    newPassword: formData.get('newPassword') ?? '',
    confirmPassword: formData.get('confirmPassword') ?? '',
  });
  if (!parsed.success) {
    const tv = await getTranslations({ locale, namespace: 'Validation' });
    return { status: 'error', fieldErrors: zodFieldErrors(parsed.error, (key) => tv(key)) };
  }

  const { refreshToken } = await getTokens();
  if (!refreshToken) redirect(`/${locale}/login`);

  const t = await getTranslations({ locale, namespace: 'Account' });
  try {
    await changePassword({
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      refreshToken,
    });
  } catch (error) {
    if (isApiError(error) && error.status === 401) redirect(`/${locale}/login`);
    if (isApiError(error) && error.status === 429) {
      return { status: 'error', message: t('rateLimited') };
    }
    if (isApiError(error) && error.status === 400) {
      // The API's two own rules, in the user's language.
      const fieldErrors: Record<string, string> = {};
      if (error.fieldErrors.currentPassword) fieldErrors.currentPassword = t('wrongCurrent');
      if (error.fieldErrors.newPassword) fieldErrors.newPassword = t('samePassword');
      if (Object.keys(fieldErrors).length > 0) return { status: 'error', fieldErrors };
    }
    const tc = await getTranslations({ locale, namespace: 'Common' });
    return { status: 'error', message: tc('genericError') };
  }

  return { status: 'success', message: t('changed') };
}
