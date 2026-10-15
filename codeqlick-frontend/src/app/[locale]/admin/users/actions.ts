'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState, savedState } from '@/lib/actions';
import { isApiError } from '@/lib/api/errors';
import {
  adminCreateUser,
  adminSendInvitation,
  adminSendWeeklyDigest,
  adminUpdateUser,
} from '@/lib/api/users';
import { formBoolean, formString, type FormState } from '@/lib/forms';
import { passwordResetSchema, userCreateSchema, userUpdateSchema } from '@/lib/schemas/admin';

/** Never echo a submitted password back into the form. */
function withoutPassword(state: FormState): FormState {
  if (!state.values) return state;
  const { password: _password, ...values } = state.values;
  return { ...state, values };
}

export async function createUserAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = userCreateSchema.safeParse({
    name: formString(formData, 'name'),
    email: formString(formData, 'email'),
    role: formString(formData, 'role'),
    password: formData.get('password') ?? '',
    locale: formString(formData, 'locale'),
  });
  if (!parsed.success) return withoutPassword(await invalidState(parsed.error, locale, formData));

  let invitationSent: boolean | undefined;
  try {
    ({ invitationSent } = await adminCreateUser(parsed.data));
  } catch (error) {
    return withoutPassword(await failedState(error, locale, formData));
  }

  revalidatePath(`/${locale}/admin`, 'layout');
  const invitation =
    invitationSent === undefined ? '' : `?invitation=${invitationSent ? 'sent' : 'failed'}`;
  redirect(`/${locale}/admin/users${invitation}`);
}

export async function sendInvitationAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getTranslations({ locale, namespace: 'Admin.users' });
  try {
    // In the user's own language.
    await adminSendInvitation(id);
  } catch (error) {
    if (isApiError(error) && error.status === 503) {
      return { status: 'error', message: t('invitationFailed') };
    }
    return failedState(error, locale, formData);
  }
  return { status: 'success', message: t('invitationSent') };
}

export async function updateUserAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = userUpdateSchema.safeParse({
    name: formString(formData, 'name'),
    role: formString(formData, 'role'),
    isActive: formBoolean(formData, 'isActive'),
    locale: formString(formData, 'locale'),
    weeklyDigest: formBoolean(formData, 'weeklyDigest'),
  });
  if (!parsed.success) return invalidState(parsed.error, locale, formData);

  try {
    await adminUpdateUser(id, parsed.data);
  } catch (error) {
    return failedState(error, locale, formData);
  }

  revalidatePath(`/${locale}/admin`, 'layout');
  return savedState(locale);
}

export async function resetPasswordAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = passwordResetSchema.safeParse({ password: formData.get('password') ?? '' });
  if (!parsed.success) return withoutPassword(await invalidState(parsed.error, locale, formData));

  try {
    await adminUpdateUser(id, parsed.data);
  } catch (error) {
    return failedState(error, locale, formData);
  }

  const t = await getTranslations({ locale, namespace: 'Admin.users' });
  return { status: 'success', message: t('passwordReset') };
}

export async function sendWeeklyDigestAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let result: { sent: boolean };
  try {
    result = await adminSendWeeklyDigest(id);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  const t = await getTranslations({ locale, namespace: 'Admin.users' });
  return result.sent
    ? { status: 'success', message: t('digestSent') }
    : { status: 'error', message: t('digestNoNews') };
}
