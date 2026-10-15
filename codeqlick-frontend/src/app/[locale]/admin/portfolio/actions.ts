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
import {
  adminCreatePortfolioItem,
  adminDeletePortfolioItem,
  adminUpdatePortfolioItem,
} from '@/lib/api/portfolio';
import type { PortfolioInput } from '@/lib/api/types';
import { formString, formText, type FormState } from '@/lib/forms';
import { PORTFOLIO_TRANSLATION_FIELDS, portfolioFormSchema } from '@/lib/schemas/admin';

function translationFields(formData: FormData, locale: 'en' | 'es') {
  return Object.fromEntries(
    PORTFOLIO_TRANSLATION_FIELDS.map((field) => [field, formText(formData, `${locale}.${field}`)]),
  );
}

/** Validated form → API input. Spanish is sent only when it was filled in. */
function parseItem(formData: FormData) {
  const parsed = portfolioFormSchema.safeParse({
    slug: formString(formData, 'slug'),
    status: formString(formData, 'status'),
    publishedAt: formString(formData, 'publishedAt'),
    coverImageUrl: formString(formData, 'coverImageUrl'),
    clientName: formString(formData, 'clientName'),
    testimonialAuthor: formString(formData, 'testimonialAuthor'),
    projectUrl: formString(formData, 'projectUrl'),
    technologies: formString(formData, 'technologies'),
    sortOrder: formString(formData, 'sortOrder'),
    en: translationFields(formData, 'en'),
    es: translationFields(formData, 'es'),
  });
  if (!parsed.success) return { error: parsed.error };

  const { en, es, ...rest } = parsed.data;
  // Empty testimonial fields are sent as null, which clears them.
  const translation = (fields: typeof en) => ({
    ...fields,
    testimonialQuote: fields.testimonialQuote.trim() || null,
    testimonialRole: fields.testimonialRole.trim() || null,
  });
  const input: PortfolioInput = { ...rest, translations: [{ locale: 'en', ...translation(en) }] };
  if (es.title.trim() !== '') input.translations.push({ locale: 'es', ...translation(es) });
  return { input };
}

/** `translations.1.title` (API) → `es.title` (form). */
function mapPath(input: PortfolioInput) {
  return (path: string) =>
    path.replace(
      /^translations\.(\d+)\./,
      (_match, index: string) => `${input.translations[Number(index)]?.locale ?? 'en'}.`,
    );
}

export async function createPortfolioAction(
  locale: AppLocale,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { input, error } = parseItem(formData);
  if (!input) return invalidState(error, locale, formData);

  try {
    await adminCreatePortfolioItem(input);
  } catch (apiError) {
    return failedState(apiError, locale, formData, mapPath(input));
  }

  revalidateSite();
  redirect(`/${locale}/admin/portfolio`);
}

export async function updatePortfolioAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const { input, error } = parseItem(formData);
  if (!input) return invalidState(error, locale, formData);

  try {
    await adminUpdatePortfolioItem(id, input);
  } catch (apiError) {
    return failedState(apiError, locale, formData, mapPath(input));
  }

  revalidateSite();
  return savedState(locale);
}

export async function deletePortfolioAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const unconfirmed = await unconfirmedDelete(locale, formData);
  if (unconfirmed) return unconfirmed;

  try {
    await adminDeletePortfolioItem(id);
  } catch (apiError) {
    return failedState(apiError, locale, formData);
  }

  revalidateSite();
  redirect(`/${locale}/admin/portfolio`);
}
