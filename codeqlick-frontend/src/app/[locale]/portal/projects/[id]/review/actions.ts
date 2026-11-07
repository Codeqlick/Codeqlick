'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import type { AppLocale } from '@/i18n/routing';
import { failedState, invalidState } from '@/lib/actions';
import { submitReview } from '@/lib/api/reviews';
import { formBoolean, formObject, type FormState } from '@/lib/forms';

const reviewSchema = z.object({
  rating: z.coerce.number('choice').int('choice').min(1, 'choice').max(5, 'choice'),
  quote: z.string().trim().min(10, 'messageTooShort').max(1500, 'tooLong'),
  authorName: z.string().trim().min(1, 'required').max(120, 'tooLong'),
  authorRole: z.string().trim().max(160, 'tooLong'),
});

export async function submitReviewAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = reviewSchema.safeParse(
    formObject(formData, ['rating', 'quote', 'authorName', 'authorRole']),
  );
  if (!parsed.success) return invalidState(parsed.error, locale, formData);
  try {
    await submitReview(projectId, {
      ...parsed.data,
      authorRole: parsed.data.authorRole || undefined,
      consent: formBoolean(formData, 'consent'),
      locale,
    });
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/portal`, 'layout');
  revalidatePath(`/${locale}/admin`, 'layout');
  const t = await getTranslations({ locale, namespace: 'Review' });
  return { status: 'success', message: t('thanks') };
}
