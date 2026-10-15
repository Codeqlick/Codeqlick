'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import type { AppLocale } from '@/i18n/routing';
import QRCode from 'qrcode';
import {
  changePassword,
  disableTwoFactor,
  enableTwoFactor,
  logout,
  revokeOtherSessions,
  revokeSession,
  startTwoFactorSetup,
  updatePreferences,
} from '@/lib/api/auth';
import { isApiError } from '@/lib/api/errors';
import { formBoolean, zodFieldErrors, type FormState } from '@/lib/forms';
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

export type TwoFactorSetupResult = { secret: string; qrCode: string } | { error: string };

/** Starts setting up an authenticator app: a new secret and its QR code (an SVG data URL). */
export async function startTwoFactorAction(locale: AppLocale): Promise<TwoFactorSetupResult> {
  try {
    const { secret, otpauthUrl } = await startTwoFactorSetup();
    const svg = await QRCode.toString(otpauthUrl, { type: 'svg', margin: 1 });
    return { secret, qrCode: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` };
  } catch (error) {
    if (isApiError(error) && error.status === 401) redirect(`/${locale}/login`);
    const tc = await getTranslations({ locale, namespace: 'Common' });
    return { error: tc('genericError') };
  }
}

export type EnableTwoFactorResult = { recoveryCodes: string[] } | { error: string };

/** Confirms the setup with the first code; returns the recovery codes to show once. */
export async function enableTwoFactorAction(
  locale: AppLocale,
  code: string,
): Promise<EnableTwoFactorResult> {
  const t = await getTranslations({ locale, namespace: 'TwoFactor' });
  const clean = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(clean)) return { error: t('invalidCode') };
  try {
    const { recoveryCodes } = await enableTwoFactor(clean);
    return { recoveryCodes };
  } catch (error) {
    if (isApiError(error) && error.status === 401) redirect(`/${locale}/login`);
    if (isApiError(error) && error.status === 400) return { error: t('invalidCode') };
    if (isApiError(error) && error.status === 429) return { error: t('rateLimited') };
    const tc = await getTranslations({ locale, namespace: 'Common' });
    return { error: tc('genericError') };
  }
}

/** Turns two-step verification off. Never echoes the password or the code back. */
export async function disableTwoFactorAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'TwoFactor' });
  const tv = await getTranslations({ locale, namespace: 'Validation' });
  const password = String(formData.get('password') ?? '');
  const code = String(formData.get('code') ?? '').replace(/\s+/g, '');
  const fieldErrors: Record<string, string> = {};
  if (!password) fieldErrors.password = tv('required');
  if (code.length < 6) fieldErrors.code = t('invalidCode');
  if (Object.keys(fieldErrors).length > 0) return { status: 'error', fieldErrors };

  try {
    await disableTwoFactor({ password, code });
  } catch (error) {
    if (isApiError(error) && error.status === 401) redirect(`/${locale}/login`);
    if (isApiError(error) && error.status === 429) {
      return { status: 'error', message: t('rateLimited') };
    }
    if (isApiError(error) && error.status === 400) {
      if (error.fieldErrors.password)
        return { status: 'error', fieldErrors: { password: t('wrongPassword') } };
      return { status: 'error', fieldErrors: { code: t('invalidCode') } };
    }
    const tc = await getTranslations({ locale, namespace: 'Common' });
    return { status: 'error', message: tc('genericError') };
  }
  revalidatePath(`/${locale}`, 'layout');
  return { status: 'success', message: t('disabled') };
}

/** Signs out one device from the sessions list (never the current one: the page has no button). */
export async function revokeSessionAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  try {
    await revokeSession(id);
  } catch (error) {
    if (isApiError(error) && error.status === 401) redirect(`/${locale}/login`);
    // Already signed out (expired, or from another tab): refreshing the list is all that is left.
    if (!(isApiError(error) && error.status === 404)) {
      const tc = await getTranslations({ locale, namespace: 'Common' });
      return { status: 'error', message: tc('genericError') };
    }
  }
  revalidatePath(`/${locale}`, 'layout');
  const t = await getTranslations({ locale, namespace: 'Sessions' });
  return { status: 'success', message: t('signedOut') };
}

/** Signs out every device except this one. */
export async function revokeOtherSessionsAction(
  locale: AppLocale,
  _previous: FormState,
  _formData: FormData,
): Promise<FormState> {
  const { refreshToken } = await getTokens();
  if (!refreshToken) redirect(`/${locale}/login`);

  try {
    await revokeOtherSessions(refreshToken);
  } catch (error) {
    if (isApiError(error) && error.status === 401) redirect(`/${locale}/login`);
    const tc = await getTranslations({ locale, namespace: 'Common' });
    return { status: 'error', message: tc('genericError') };
  }
  revalidatePath(`/${locale}`, 'layout');
  const t = await getTranslations({ locale, namespace: 'Sessions' });
  return { status: 'success', message: t('signedOutOthers') };
}

/** The caller's email preferences (clients: the weekly summary). */
export async function updatePreferencesAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await updatePreferences({ weeklyDigest: formBoolean(formData, 'weeklyDigest') });
  } catch (error) {
    if (isApiError(error) && error.status === 401) redirect(`/${locale}/login`);
    const tc = await getTranslations({ locale, namespace: 'Common' });
    return { status: 'error', message: tc('genericError') };
  }
  revalidatePath(`/${locale}/portal`, 'layout');
  const tc = await getTranslations({ locale, namespace: 'Common' });
  return { status: 'success', message: tc('saved') };
}
