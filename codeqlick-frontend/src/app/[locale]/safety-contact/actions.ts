'use server';

import { respondTrustedContact } from '@/lib/api/cruising-safety';
import { isApiError } from '@/lib/api/errors';
import { formString } from '@/lib/forms';

export type SafetyContactState = {
  /** What the person did, once it worked. */
  done?: 'accepted' | 'refused' | 'stopped';
  problem?: 'invalidLink' | 'retry';
};

/**
 * The trusted contact's answer: "Accept" or "Refuse" from the invitation, "Stop" from an alert's
 * link. A button, not the link itself: mail scanners open links and must change nothing.
 */
export async function respondSafetyContactAction(
  _previous: SafetyContactState,
  formData: FormData,
): Promise<SafetyContactState> {
  const token = formString(formData, 'token');
  if (!token) return { problem: 'invalidLink' };
  const intent = formData.get('intent');
  const accept = intent === 'accept';
  try {
    await respondTrustedContact(token, accept);
  } catch (error) {
    const status = isApiError(error) ? error.status : 0;
    return { problem: status === 404 || status === 400 ? 'invalidLink' : 'retry' };
  }
  return { done: intent === 'stop' ? 'stopped' : accept ? 'accepted' : 'refused' };
}
