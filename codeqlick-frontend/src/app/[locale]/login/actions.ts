'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { cruisingLocaleOrDefault } from '@/i18n/locale';
import { login, passkeyLogin, passkeyLoginOptions } from '@/lib/api/auth';
import { isApiError, isCaptchaError } from '@/lib/api/errors';
import type { AuthTokens, LoginResult, PasskeyLoginOptions } from '@/lib/api/types';
import { isWebAuthnResponse } from '@/lib/passkeys';
import { TWO_FACTOR_COOKIE, TWO_FACTOR_MAX_AGE } from '@/lib/auth/constants';
import { authCookieOptions, isSecureCookieEnv } from '@/lib/auth/refresh';
import { invalidState } from '@/lib/actions';
import { safeNextPath, setAuthCookies } from '@/lib/auth/session';
import { homeAfterSignIn, shortNext } from '@/lib/webapp-request';
import { formString, type FormState } from '@/lib/forms';
import { loginSchema } from '@/lib/schemas/auth';

/** POST /auth/login, store the tokens in httpOnly cookies and go to `next` or the role's home. */
export async function loginAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const locale = cruisingLocaleOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Login' });
  const email = formString(formData, 'email');

  // The password is never echoed back into the form.
  const parsed = loginSchema.safeParse({ email, password: formData.get('password') ?? '' });
  if (!parsed.success) {
    return { ...(await invalidState(parsed.error, locale, formData)), values: { email } };
  }

  let result: LoginResult;
  try {
    result = await login({ ...parsed.data, captcha: formString(formData, 'captcha') || undefined });
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    const message = isCaptchaError(error)
      ? t('captcha')
      : status === 401 || status === 400 || status === 403
        ? t('invalid')
        : status === 429
          ? t('rateLimited')
          : t('error');
    return { status: 'error', message, values: { email } };
  }

  const next = await shortNext(safeNextPath(formData.get('next'), locale), locale);
  if ('twoFactorRequired' in result) {
    // The password was right; the code is asked on the next page.
    const store = await cookies();
    store.set(
      TWO_FACTOR_COOKIE,
      result.challengeToken,
      authCookieOptions(TWO_FACTOR_MAX_AGE, isSecureCookieEnv()),
    );
    redirect(`/${locale}/login/verify${next ? `?next=${encodeURIComponent(next)}` : ''}`);
  }

  await setAuthCookies(result);
  redirect(next ?? (await homeAfterSignIn(locale, result.user.role)));
}

/** A passkey sign-in's challenge (decision 104); null when the API can't give one now. */
export async function passkeyLoginOptionsAction(): Promise<PasskeyLoginOptions | null> {
  try {
    return await passkeyLoginOptions();
  } catch {
    return null;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The browser's assertion: the API checks it and answers with tokens, as a password sign-in
 * (a passkey counts as both factors, so no code page). Same cookies and redirect as `loginAction`.
 */
export async function passkeyLoginAction(
  rawLocale: string,
  rawNext: string,
  challengeId: string,
  response: unknown,
): Promise<{ error: string }> {
  const locale = cruisingLocaleOrDefault(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Login' });
  if (typeof challengeId !== 'string' || !UUID.test(challengeId) || !isWebAuthnResponse(response)) {
    return { error: t('passkeyFailed') };
  }

  let tokens: AuthTokens;
  try {
    tokens = await passkeyLogin({ challengeId, response });
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    return { error: status === 429 ? t('rateLimited') : t('passkeyFailed') };
  }

  const next = await shortNext(safeNextPath(rawNext, locale), locale);
  await setAuthCookies(tokens);
  redirect(next ?? (await homeAfterSignIn(locale, tokens.user.role)));
}
