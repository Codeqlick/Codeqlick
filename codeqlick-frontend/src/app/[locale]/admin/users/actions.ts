'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState, savedState } from '@/lib/actions';
import { adminCreateUser, adminUpdateUser } from '@/lib/api/users';
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
  });
  if (!parsed.success) return withoutPassword(await invalidState(parsed.error, locale, formData));

  try {
    await adminCreateUser(parsed.data);
  } catch (error) {
    return failedState(error, locale, formData);
  }

  revalidatePath(`/${locale}/admin`, 'layout');
  redirect(`/${locale}/admin/users`);
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
