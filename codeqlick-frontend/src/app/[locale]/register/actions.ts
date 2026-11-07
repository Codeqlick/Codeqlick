'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import { acceptInvitation, confirmSignup, register } from '@/lib/api/auth';
import { isApiError } from '@/lib/api/errors';
import type { AuthTokens } from '@/lib/api/types';
import { homeForRole, setAuthCookies } from '@/lib/auth/session';
import { formString, zodFieldErrors, type FormState } from '@/lib/forms';
import { registerSchema } from '@/lib/schemas/auth';

/** What the form keeps after an error: never the passwords. */
function kept(formData: FormData) {
  return { name: formString(formData, 'name'), email: formString(formData, 'email') };
}

async function failure(
  locale: 'en' | 'es',
  error: unknown,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Register' });
  const status = isApiError(error) ? error.status : 0;
  const message =
    status === 400 ? t('invalidLink') : status === 429 ? t('rateLimited') : t('error');
  return { status: 'error', message, values: kept(formData) };
}

/**
 * The sign-up form. With an invitation (its token proves the email) the account is theirs and
 * they are signed in at once; otherwise the API emails the link that confirms it.
 */
export async function registerAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const invitation = formString(formData, 'invitation');
  const parsed = registerSchema.safeParse({
    name: formString(formData, 'name'),
    email: formString(formData, 'email'),
    password: formData.get('password') ?? '',
    confirmPassword: formData.get('confirmPassword') ?? '',
    acceptPrivacy: formData.get('acceptPrivacy') === 'on',
  });
  if (!parsed.success) {
    const tv = await getTranslations({ locale, namespace: 'Validation' });
    return {
      status: 'error',
      fieldErrors: zodFieldErrors(parsed.error, (key) => tv(key)),
      values: kept(formData),
    };
  }
  const { name, email, password } = parsed.data;

  if (invitation) {
    let tokens: AuthTokens;
    try {
      tokens = await acceptInvitation({
        token: invitation,
        name,
        password,
        locale,
        acceptPrivacy: true,
      });
    } catch (error) {
      return failure(locale, error, formData);
    }
    await setAuthCookies(tokens);
    redirect(homeForRole(locale, tokens.user.role));
  }

  try {
    await register({
      name,
      email,
      password,
      locale,
      acceptPrivacy: true,
      website: formString(formData, 'website'),
    });
  } catch (error) {
    return failure(locale, error, formData);
  }
  redirect(`/${locale}/register?sent=${encodeURIComponent(email)}`);
}

/** The button on the confirmation page: spends the emailed token and signs in. */
export async function confirmSignupAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  let tokens: AuthTokens;
  try {
    tokens = await confirmSignup(formString(formData, 'token'));
  } catch (error) {
    return failure(locale, error, formData);
  }
  await setAuthCookies(tokens);
  redirect(homeForRole(locale, tokens.user.role));
}
