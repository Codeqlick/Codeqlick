'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import { login } from '@/lib/api/auth';
import { isApiError } from '@/lib/api/errors';
import type { LoginResult } from '@/lib/api/types';
import { TWO_FACTOR_COOKIE, TWO_FACTOR_MAX_AGE } from '@/lib/auth/constants';
import { authCookieOptions, isSecureCookieEnv } from '@/lib/auth/refresh';
import { invalidState } from '@/lib/actions';
import { homeForRole, safeNextPath, setAuthCookies } from '@/lib/auth/session';
import { formString, type FormState } from '@/lib/forms';
import { loginSchema } from '@/lib/schemas/auth';

/** POST /auth/login, store the tokens in httpOnly cookies and go to `next` or the role's home. */
export async function loginAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'Login' });
  const email = formString(formData, 'email');

  // The password is never echoed back into the form.
  const parsed = loginSchema.safeParse({ email, password: formData.get('password') ?? '' });
  if (!parsed.success) {
    return { ...(await invalidState(parsed.error, locale, formData)), values: { email } };
  }

  let result: LoginResult;
  try {
    result = await login(parsed.data);
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    const message =
      status === 401 || status === 400 || status === 403
        ? t('invalid')
        : status === 429
          ? t('rateLimited')
          : t('error');
    return { status: 'error', message, values: { email } };
  }

  const next = safeNextPath(formData.get('next'), locale);
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
  redirect(next ?? homeForRole(locale, result.user.role));
}
