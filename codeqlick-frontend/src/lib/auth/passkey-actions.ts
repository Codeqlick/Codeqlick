'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { localeOrDefault } from '@/i18n/locale';
import {
  deletePasskey,
  passkeyRegistrationOptions,
  registerPasskey,
  renamePasskey,
} from '@/lib/api/auth';
import { isApiError } from '@/lib/api/errors';
import type { WebAuthnJson } from '@/lib/api/types';
import type { FormState } from '@/lib/forms';
import { cleanPasskeyName, isWebAuthnResponse, MAX_PASSKEYS } from '@/lib/passkeys';

/** Passkeys in My account → Security (decision 104). The browser never calls the API. */

export type PasskeyOptionsResult =
  { options: WebAuthnJson } | { error: string; field?: 'password' | 'name' };

export type PasskeyRegisterResult = { ok: true; message: string } | { error: string };

/** Adding a passkey, first step: the password again, then the options for the browser. */
export async function passkeyRegistrationOptionsAction(
  rawLocale: string,
  password: string,
): Promise<PasskeyOptionsResult> {
  const locale = localeOrDefault(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Passkeys' });
  if (typeof password !== 'string' || !password) {
    return { error: t('wrongPassword'), field: 'password' };
  }
  try {
    return { options: await passkeyRegistrationOptions(password) };
  } catch (error) {
    if (isApiError(error)) {
      if (error.status === 401) redirect(`/${locale}/login`);
      if (error.status === 400) return { error: t('wrongPassword'), field: 'password' };
      if (error.status === 409) return { error: t('limit', { max: MAX_PASSKEYS }) };
      if (error.status === 429) return { error: t('rateLimited') };
    }
    return { error: t('failed') };
  }
}

/** Second step: the browser's attestation goes to the API, which stores the passkey. */
export async function registerPasskeyAction(
  rawLocale: string,
  response: unknown,
  rawName: string,
): Promise<PasskeyRegisterResult> {
  const locale = localeOrDefault(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Passkeys' });
  const name = cleanPasskeyName(rawName);
  if (name === null) return { error: t('nameInvalid') };
  if (!isWebAuthnResponse(response)) return { error: t('failed') };
  try {
    await registerPasskey({ response, ...(name ? { name } : {}) });
  } catch (error) {
    if (isApiError(error)) {
      if (error.status === 401) redirect(`/${locale}/login`);
      if (error.status === 409) {
        return {
          error: /already/i.test(error.detail ?? '')
            ? t('exists')
            : t('limit', { max: MAX_PASSKEYS }),
        };
      }
      if (error.status === 429) return { error: t('rateLimited') };
    }
    return { error: t('failed') };
  }
  revalidatePath(`/${locale}`, 'layout');
  return { ok: true, message: t('added') };
}

export async function renamePasskeyAction(
  rawLocale: string,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Passkeys' });
  const name = cleanPasskeyName(formData.get('name'));
  if (!name) {
    return {
      status: 'error',
      fieldErrors: { name: t('nameInvalid') },
      values: { name: String(formData.get('name') ?? '') },
    };
  }
  try {
    await renamePasskey(id, name);
  } catch (error) {
    if (isApiError(error) && error.status === 401) redirect(`/${locale}/login`);
    const tc = await getTranslations({ locale, namespace: 'Common' });
    return { status: 'error', message: tc('genericError'), values: { name } };
  }
  revalidatePath(`/${locale}`, 'layout');
  return { status: 'success', message: t('renamed') };
}

/** Deletes one of the passkeys. Never echoes the password back. */
export async function deletePasskeyAction(
  rawLocale: string,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const locale = localeOrDefault(rawLocale);
  const t = await getTranslations({ locale, namespace: 'Passkeys' });
  const password = String(formData.get('password') ?? '');
  if (!password) return { status: 'error', fieldErrors: { password: t('wrongPassword') } };
  try {
    await deletePasskey(id, password);
  } catch (error) {
    if (isApiError(error)) {
      if (error.status === 401) redirect(`/${locale}/login`);
      if (error.status === 400) {
        return { status: 'error', fieldErrors: { password: t('wrongPassword') } };
      }
      if (error.status === 429) return { status: 'error', message: t('rateLimited') };
    }
    // 404: already deleted (another tab); refreshing the list is all that is left.
    if (!(isApiError(error) && error.status === 404)) {
      const tc = await getTranslations({ locale, namespace: 'Common' });
      return { status: 'error', message: tc('genericError') };
    }
  }
  revalidatePath(`/${locale}`, 'layout');
  return { status: 'success', message: t('deleted') };
}
