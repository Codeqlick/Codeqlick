'use server';

import { revalidatePath } from 'next/cache';
import type { AppLocale } from '@/i18n/routing';
import { failedState } from '@/lib/actions';
import { adminRequestReview, adminSetReviewStatus } from '@/lib/api/reviews';
import type { FormState } from '@/lib/forms';

function revalidateReviews(locale: AppLocale) {
  revalidatePath(`/${locale}`, 'layout');
}

export async function requestReviewAction(
  locale: AppLocale,
  projectId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminRequestReview(projectId);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateReviews(locale);
  return { status: 'idle' };
}

export async function setReviewStatusAction(
  locale: AppLocale,
  projectId: string,
  status: 'PUBLISHED' | 'HIDDEN',
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminSetReviewStatus(projectId, status);
  } catch (error) {
    return failedState(error, locale, formData);
  }
  revalidateReviews(locale);
  return { status: 'idle' };
}
