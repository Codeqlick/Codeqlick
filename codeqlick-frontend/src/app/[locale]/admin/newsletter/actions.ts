'use server';

import { revalidatePath } from 'next/cache';
import type { AppLocale } from '@/i18n/routing';
import { failedState } from '@/lib/actions';
import { isApiError } from '@/lib/api/errors';
import { adminDeleteSubscriber } from '@/lib/api/newsletter';
import type { FormState } from '@/lib/forms';

/**
 * Removes a subscriber (erasure on request: it only deletes a sign-up and they can sign up again,
 * so no confirmation is asked, architecture 6.2).
 */
export async function deleteSubscriberAction(
  locale: AppLocale,
  id: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  try {
    await adminDeleteSubscriber(id);
  } catch (error) {
    // Already gone (deleted from another tab): refreshing the list is all that is left to do.
    if (!(isApiError(error) && error.status === 404)) return failedState(error, locale, formData);
  }
  revalidatePath(`/${locale}/admin/newsletter`);
  return { status: 'success' };
}
