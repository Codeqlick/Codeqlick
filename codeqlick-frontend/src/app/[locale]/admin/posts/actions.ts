'use server';

import { redirect } from 'next/navigation';
import type { AppLocale } from '@/i18n/routing';
import {
  failedState,
  invalidState,
  revalidateSite,
  savedState,
  unconfirmedDelete,
} from '@/lib/actions';
import { adminCreatePost, adminDeletePost, adminUpdatePost } from '@/lib/api/posts';
import type { PostInput } from '@/lib/api/types';
import { formString, formText, type FormState } from '@/lib/forms';
import { POST_TRANSLATION_FIELDS, postFormSchema } from '@/lib/schemas/admin';

function translationFields(formData: FormData, locale: 'en' | 'es') {
  return Object.fromEntries(
    POST_TRANSLATION_FIELDS.map((field) => [field, formText(formData, `${locale}.${field}`)]),
  );
}

/** Validated form → API input. Spanish is sent only when it was filled in. */
function parsePost(formData: FormData) {
  const parsed = postFormSchema.safeParse({
    slug: formString(formData, 'slug'),
    status: formString(formData, 'status'),
    publishedAt: formString(formData, 'publishedAt'),
    coverImageUrl: formString(formData, 'coverImageUrl'),
    en: translationFields(formData, 'en'),
    es: translationFields(formData, 'es'),
  });
  if (!parsed.success) return { error: parsed.error };

  const { en, es, ...rest } = parsed.data;
  const tagIds = formData.getAll('tagIds').filter((value) => typeof value === 'string');
  const input: PostInput = { ...rest, tagIds, translations: [{ locale: 'en', ...en }] };
  if (es.title.trim() !== '') input.translations.push({ locale: 'es', ...es });
  return { input };
}

/** `translations.1.title` (API) → `es.title` (form). */
function mapPath(input: PostInput) {
  return (path: string) =>
    path.replace(
      /^translations\.(\d+)\./,
      (_match, index: string) => `${input.translations[Number(index)]?.locale ?? 'en'}.`,
    );
}

export async function createPostAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { input, error } = parsePost(formData);
  if (!input) return invalidState(error, locale, formData);

  try {
    await adminCreatePost(input);
  } catch (apiError) {
    return failedState(apiError, locale, formData, mapPath(input));
  }

  revalidateSite();
  redirect(`/${locale}/admin/posts`);
}

export async function updatePostAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { input, error } = parsePost(formData);
  if (!input) return invalidState(error, locale, formData);

  try {
    await adminUpdatePost(id, input);
  } catch (apiError) {
    return failedState(apiError, locale, formData, mapPath(input));
  }

  revalidateSite();
  return savedState(locale);
}

export async function deletePostAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const unconfirmed = await unconfirmedDelete(locale, formData);
  if (unconfirmed) return unconfirmed;

  try {
    await adminDeletePost(id);
  } catch (apiError) {
    return failedState(apiError, locale, formData);
  }

  revalidateSite();
  redirect(`/${locale}/admin/posts`);
}
