'use server';

import { updateEmailPreferences } from '@/lib/api/email-preferences';
import { isApiError } from '@/lib/api/errors';
import { preferencesProblem, type UnsubscribeState } from '@/lib/email-preferences';
import { formString } from '@/lib/forms';

/**
 * The unsubscribe page's button: "Unsubscribe" sends `subscribed=false`, "Undo" and "Subscribe
 * again" send `true`. On failure the page keeps what it showed and says why.
 */
export async function setEmailSubscriptionAction(
  previous: UnsubscribeState,
  formData: FormData,
): Promise<UnsubscribeState> {
  const token = formString(formData, 'token');
  if (!token) return { ...previous, problem: 'invalidLink' };
  try {
    const preferences = await updateEmailPreferences({
      token,
      subscribed: formData.get('subscribed') === 'true',
    });
    return { subscribed: preferences.subscribed, changed: true };
  } catch (error) {
    return { ...previous, problem: preferencesProblem(isApiError(error) ? error.status : 0) };
  }
}
