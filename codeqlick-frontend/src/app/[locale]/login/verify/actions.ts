'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import { verifyTwoFactor } from '@/lib/api/auth';
import { isApiError } from '@/lib/api/errors';
import type { AuthTokens } from '@/lib/api/types';
import { TWO_FACTOR_COOKIE } from '@/lib/auth/constants';
import { homeForRole, safeNextPath, setAuthCookies } from '@/lib/auth/session';
import { formString, type FormState } from '@/lib/forms';

/** Second step of the sign-in: the authenticator or recovery code finishes it. */
export async function verifyTwoFactorAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'TwoFactorLogin' });
  const store = await cookies();
  const challengeToken = store.get(TWO_FACTOR_COOKIE)?.value;
  if (!challengeToken) redirect(`/${locale}/login`);

  const code = formString(formData, 'code').replace(/\s+/g, '');
  if (code.length < 6) return { status: 'error', fieldErrors: { code: t('invalid') } };

  let tokens: AuthTokens;
  try {
    tokens = await verifyTwoFactor({ challengeToken, code });
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 401 && /expired/i.test(isApiError(error) ? (error.detail ?? '') : '')) {
      store.delete(TWO_FACTOR_COOKIE);
      return { status: 'error', message: t('expired') };
    }
    if (status === 401 || status === 400) {
      return { status: 'error', fieldErrors: { code: t('invalid') } };
    }
    if (status === 429) return { status: 'error', message: t('rateLimited') };
    const tc = await getTranslations({ locale, namespace: 'Common' });
    return { status: 'error', message: tc('genericError') };
  }

  store.delete(TWO_FACTOR_COOKIE);
  await setAuthCookies(tokens);
  redirect(safeNextPath(formData.get('next'), locale) ?? homeForRole(locale, tokens.user.role));
}
