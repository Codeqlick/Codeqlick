'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import type { AppLocale } from '@/i18n/routing';
import {
  checkUsername,
  confirmEmailChange,
  deleteMe,
  requestEmailChange,
  setUsername,
  updateMe,
  type UsernameCheck,
} from '@/lib/api/auth';
import { isApiError, isDisposableEmailError } from '@/lib/api/errors';
import { formString, type FormState } from '@/lib/forms';
import { clearAuthCookies } from './session';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Changes the signed-in person's name. */
export async function updateNameAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Account' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const name = formString(formData, 'name');
  if (!name || name.length > 120) {
    return { status: 'error', fieldErrors: { name: t('nameInvalid') }, values: { name } };
  }
  try {
    await updateMe({ name });
  } catch (error) {
    if (isApiError(error) && error.status === 401) redirect(`/${locale}/login`);
    return { status: 'error', message: tc('genericError'), values: { name } };
  }
  revalidatePath(`/${locale}`, 'layout');
  return { status: 'success', message: tc('saved') };
}

/** Same rules as the API: 3–20 of a-z, 0-9, `.` and `_`, letter or digit at both ends, no `..`. */
const USERNAME_PATTERN = /^(?!.*\.\.)[a-z0-9][a-z0-9._]{1,18}[a-z0-9]$/;

/** Live check while typing: free, taken, reserved or not valid. */
export async function checkUsernameAction(raw: string): Promise<UsernameCheck | null> {
  const username = raw.trim().toLowerCase().replace(/^@/, '');
  if (!USERNAME_PATTERN.test(username)) return { username, available: false, reason: 'invalid' };
  try {
    return await checkUsername(username);
  } catch {
    return null;
  }
}

/** Chooses, changes or (empty) removes the username. */
export async function updateUsernameAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Account.username' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const username = formString(formData, 'username').toLowerCase().replace(/^@/, '');
  const values = { username };
  if (username && !USERNAME_PATTERN.test(username)) {
    return { status: 'error', fieldErrors: { username: t('invalid') }, values };
  }
  try {
    await setUsername(username || null);
  } catch (error) {
    if (isApiError(error)) {
      if (error.status === 401) redirect(`/${locale}/login`);
      if (error.status === 409) {
        return { status: 'error', fieldErrors: { username: t('taken') }, values };
      }
      if (error.status === 429) return { status: 'error', message: t('rateLimited'), values };
      if (error.status === 400) {
        return { status: 'error', fieldErrors: { username: t('reserved') }, values };
      }
    }
    return { status: 'error', message: tc('genericError'), values };
  }
  revalidatePath(`/${locale}`, 'layout');
  return { status: 'success', message: username ? t('saved', { username }) : t('removed') };
}

/** Sends the confirmation link to the new address. The password is never echoed back. */
export async function changeEmailAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Account' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const email = formString(formData, 'email').toLowerCase();
  const password = String(formData.get('password') ?? '');
  const values = { email };
  if (!EMAIL_PATTERN.test(email)) {
    return { status: 'error', fieldErrors: { email: t('emailInvalid') }, values };
  }
  if (!password) return { status: 'error', fieldErrors: { password: t('passwordNeeded') }, values };
  try {
    await requestEmailChange({ email, password, locale });
  } catch (error) {
    if (isApiError(error)) {
      if (error.status === 401) redirect(`/${locale}/login`);
      if (error.status === 409) {
        return { status: 'error', fieldErrors: { email: t('emailTaken') }, values };
      }
      if (error.status === 429) return { status: 'error', message: t('rateLimited'), values };
      if (isDisposableEmailError(error)) {
        return { status: 'error', fieldErrors: { email: t('emailDisposable') }, values };
      }
      if (error.status === 400) {
        if (error.fieldErrors.password) {
          return { status: 'error', fieldErrors: { password: t('wrongPassword') }, values };
        }
        return { status: 'error', fieldErrors: { email: t('emailSame') }, values };
      }
    }
    return { status: 'error', message: tc('genericError'), values };
  }
  return { status: 'success', message: t('emailSent', { email }) };
}

/** The link of the confirmation email: the account moves to the new address. */
export async function confirmEmailAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(formData.get('locale'));
  const t = await getTranslations({ locale, namespace: 'ConfirmEmail' });
  let email: string;
  try {
    ({ email } = await confirmEmailChange(formString(formData, 'token')));
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    if (status === 400) return { status: 'error', message: t('invalidLink') };
    if (status === 409) return { status: 'error', message: t('taken') };
    if (status === 429) return { status: 'error', message: t('rateLimited') };
    const tc = await getTranslations({ locale, namespace: 'Common' });
    return { status: 'error', message: tc('genericError') };
  }
  // The API ended every session of the account, including one this browser may hold.
  await clearAuthCookies();
  redirect(`/${locale}/login?emailChanged=1&email=${encodeURIComponent(email)}`);
}

/** Deletes the signed-in person's own account, then signs this browser out. */
export async function deleteAccountAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Account' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const password = String(formData.get('password') ?? '');
  if (formData.get('confirm') !== 'on') {
    return { status: 'error', fieldErrors: { confirm: t('deleteConfirmNeeded') } };
  }
  if (!password) return { status: 'error', fieldErrors: { password: t('passwordNeeded') } };
  try {
    await deleteMe(password);
  } catch (error) {
    if (isApiError(error)) {
      if (error.status === 401) redirect(`/${locale}/login`);
      if (error.status === 400) {
        return { status: 'error', fieldErrors: { password: t('wrongPassword') } };
      }
      if (error.status === 409) return { status: 'error', message: t('deleteHasProjects') };
      if (error.status === 403) return { status: 'error', message: t('deleteAdmin') };
      if (error.status === 429) return { status: 'error', message: t('rateLimited') };
    }
    return { status: 'error', message: tc('genericError') };
  }
  await clearAuthCookies();
  redirect(`/${locale}/login?accountDeleted=1`);
}
