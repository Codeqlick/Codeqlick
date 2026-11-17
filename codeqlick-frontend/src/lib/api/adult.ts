import 'server-only';
import type {
  AdultApp,
  BlockedMember,
  SeriousCategory,
  SharedSuspensionDuration,
} from '@/lib/adult';
import { apiFetch } from './client';
import { isApiError } from './errors';

/** The shared 18+ safety API (architecture 4.16, phase 1): `/adult/*` and `/admin/adult/*`. */

export type AdultVerificationStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';

export type AdultVerification = {
  status: AdultVerificationStatus;
  sourceApp: AdultApp | null;
  verifiedAt: string | null;
  sentAt: string | null;
  note: string | null;
  hasPhoto: boolean;
};

/** One verification for the three apps; `app` is where it is sent from (the name on the paper). */
export function uploadAdultVerification(app: AdultApp, file: File) {
  const form = new FormData();
  form.set('file', file, file.name || 'verification.jpg');
  return apiFetch<AdultVerification>('/adult/verification', {
    method: 'POST',
    body: form,
    query: { app },
    auth: 'required',
    signal: AbortSignal.timeout(30_000),
  });
}

/** The blocks of the person, named as `app` knows the blocked people. */
export async function listAdultBlocks(app: AdultApp): Promise<BlockedMember[]> {
  return (
    await apiFetch<{ items: BlockedMember[] }>('/adult/blocks', {
      query: { app },
      auth: 'required',
    })
  ).items;
}

/** Lifts a block in all three apps. */
export function unblockAdult(ref: string) {
  return apiFetch<void>(`/adult/blocks/${encodeURIComponent(ref)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

// ---- Admin -----------------------------------------------------------------------------------------

export type AdultAppSummary = {
  app: AdultApp;
  enteredAt: string | null;
  name: string | null;
  reportsReceived: {
    open: number;
    dismissed: number;
    actioned: number;
    byReason: Record<string, number>;
  };
  reportsMade: number;
  suspension: {
    since: string;
    until: string | null;
    reason: string | null;
    category: string | null;
    shared: boolean;
  } | null;
};

export type AdultSharedSuspension = {
  id: string;
  category: string;
  sourceApp: AdultApp | null;
  reason: string | null;
  until: string | null;
  createdAt: string;
  by: { id: string; name: string } | null;
  liftedAt: string | null;
  liftedBy: { id: string; name: string } | null;
  liftReason: string | null;
  active: boolean;
};

export type AdultUserOverview = {
  userId: string;
  name: string;
  email: string;
  apps: AdultAppSummary[];
  sharedSuspensions: AdultSharedSuspension[];
  blockedBy: number;
  verification: {
    status: AdultVerificationStatus;
    sourceApp: AdultApp | null;
    verifiedName: string | null;
    sentAt: string | null;
    decidedAt: string | null;
    hasPhoto: boolean;
    history: { action: string; at: string; by: string | null; details: unknown }[];
  } | null;
  link: null;
};

/** Null when the person entered none of the three apps (404). */
export async function getAdultUserOverview(userId: string): Promise<AdultUserOverview | null> {
  try {
    return await apiFetch<AdultUserOverview>(`/admin/adult/users/${encodeURIComponent(userId)}`, {
      auth: 'required',
    });
  } catch (error) {
    if (isApiError(error) && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}

export type AdultPendingVerification = {
  userId: string;
  name: string;
  email: string;
  names: { cruising: string | null; username: string | null };
  verifiedName: string | null;
  sourceApp: AdultApp | null;
  sentAt: string | null;
};

export async function listAdultVerifications(): Promise<AdultPendingVerification[]> {
  return (
    await apiFetch<{ items: AdultPendingVerification[] }>('/admin/adult/verifications', {
      auth: 'required',
    })
  ).items;
}

export function decideAdultVerification(userId: string, approve: boolean, note?: string) {
  return apiFetch<void>(`/admin/adult/verifications/${encodeURIComponent(userId)}`, {
    method: 'POST',
    body: { approve, ...(note ? { note } : {}) },
    auth: 'required',
  });
}

/** Withdraws the verification in the three apps. */
export function withdrawAdultVerification(userId: string, reason?: string) {
  return apiFetch<void>(`/admin/adult/users/${encodeURIComponent(userId)}/verification`, {
    method: 'DELETE',
    body: reason ? { reason } : {},
    auth: 'required',
  });
}

export function suspendAdultUser(
  userId: string,
  input: {
    category: SeriousCategory;
    sourceApp: AdultApp;
    reason: string;
    duration: SharedSuspensionDuration;
  },
) {
  return apiFetch<void>(`/admin/adult/users/${encodeURIComponent(userId)}/suspension`, {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

export function liftAdultSuspension(userId: string, reason: string) {
  return apiFetch<void>(`/admin/adult/users/${encodeURIComponent(userId)}/suspension`, {
    method: 'DELETE',
    body: { reason },
    auth: 'required',
  });
}

export type ReviewSuspension = {
  app: AdultApp;
  userId: string;
  name: string;
  email: string;
  appName: string | null;
  reportReason: string;
  reason: string | null;
  suspendedAt: string;
  until: string | null;
};

export async function listReviewSuspensions(): Promise<ReviewSuspension[]> {
  return (
    await apiFetch<{ items: ReviewSuspension[] }>('/admin/adult/review-suspensions', {
      auth: 'required',
    })
  ).items;
}

export function shareReviewSuspension(app: AdultApp, userId: string) {
  return apiFetch<void>(
    `/admin/adult/review-suspensions/${encodeURIComponent(app)}/${encodeURIComponent(userId)}/share`,
    { method: 'POST', body: {}, auth: 'required' },
  );
}

export function keepReviewSuspension(app: AdultApp, userId: string) {
  return apiFetch<void>(
    `/admin/adult/review-suspensions/${encodeURIComponent(app)}/${encodeURIComponent(userId)}/keep`,
    { method: 'POST', auth: 'required' },
  );
}

/** After an accepted appeal by email. 404 when no row matches. */
export function deleteBannedEmail(email: string) {
  return apiFetch<void>('/admin/adult/banned-emails', {
    method: 'DELETE',
    body: { email },
    auth: 'required',
  });
}
