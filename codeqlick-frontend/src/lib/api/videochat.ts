import 'server-only';
import { apiFetch } from './client';
import { isApiError } from './errors';
import type { Interest } from '../videochat-interests';

/** The video chat (architecture 4.7). Shapes mirror the API's videochat module. */

export const GENDERS = ['WOMAN', 'MAN', 'NONBINARY'] as const;
export type Gender = (typeof GENDERS)[number];

export { INTERESTS, MAX_INTERESTS, type Interest } from '../videochat-interests';

/** Public profile and matching filters (all free). */
export type VideochatSettings = {
  nickname: string | null;
  gender: Gender | null;
  seeking: Gender[];
  country: string | null;
  language: string | null;
  sameCountryOnly: boolean;
  sameLanguageOnly: boolean;
  interests: Interest[];
};

export type AppealStatus = 'OPEN' | 'ACCEPTED' | 'REJECTED';

export type VideochatStatus = {
  onboarded: boolean;
  termsVersion: string;
  acceptedTermsVersion: string | null;
  suspended: boolean;
  suspension: {
    reason: string | null;
    /** Null: until the team lifts it. */
    until: string | null;
    appeal: { status: AppealStatus; response: string | null; createdAt: string } | null;
  } | null;
  ageVerificationRequired: boolean;
  ageVerified: boolean;
  allowed: boolean;
  profile: VideochatSettings | null;
  /** VAPID key for "someone is waiting" notifications; null while they are off. */
  pushPublicKey: string | null;
};

/** A browser's Web Push subscription (PushSubscription.toJSON()). */
export type PushSubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  locale: 'en' | 'es';
};

export const SUSPENSION_DURATIONS = ['24h', '7d', '30d', 'permanent'] as const;
export type SuspensionDuration = (typeof SUSPENSION_DURATIONS)[number];

export type IceServer = { urls: string[]; username?: string; credential?: string };

export type VideochatTicket = { ticket: string; expiresIn: number; iceServers: IceServer[] };

export const REPORT_REASONS = [
  'MINOR',
  'NON_CONSENSUAL',
  'ILLEGAL',
  'HARASSMENT',
  'HATE',
  'SPAM',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportStatus = 'OPEN' | 'DISMISSED' | 'ACTIONED';

export type VideochatReport = {
  id: string;
  reason: ReportReason;
  details: string | null;
  transcript: Array<{ from: 'reporter' | 'reported'; text: string; at: string }>;
  status: ReportStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string } | null;
  reporter: { id: string; name: string; email: string };
  reported: {
    id: string;
    name: string;
    email: string;
    suspendedAt: string | null;
    recentReports: number;
  };
};

type Person = { id: string; name: string; email: string };

export type VideochatSuspension = {
  user: Person;
  suspendedAt: string;
  until: string | null;
  reason: string | null;
};

export type VideochatAppeal = {
  id: string;
  message: string;
  status: AppealStatus;
  response: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: Person;
  sanction: { reason: string | null; until: string | null; createdAt: string };
};

export type VideochatUserDetail = {
  user: Person & { createdAt: string };
  profile: VideochatSettings;
  suspension: { since: string; until: string | null; reason: string | null } | null;
  ageVerified: boolean;
  onboardedAt: string;
  reportsReceived: Array<{
    id: string;
    reason: ReportReason;
    status: ReportStatus;
    details: string | null;
    createdAt: string;
    reporter: Person;
  }>;
  reportsMade: Array<{
    id: string;
    reason: ReportReason;
    status: ReportStatus;
    details: string | null;
    createdAt: string;
    reported: Person;
  }>;
  sanctions: Array<{
    id: string;
    kind: 'SUSPENDED' | 'LIFTED';
    reason: string | null;
    until: string | null;
    createdAt: string;
    by: Person | null;
  }>;
  appeals: Array<{
    id: string;
    message: string;
    status: AppealStatus;
    response: string | null;
    createdAt: string;
    reviewedAt: string | null;
  }>;
};

export type VideochatStats = { online: number; waiting: number; calls: number };

export function getVideochatStatus() {
  return apiFetch<VideochatStatus>('/videochat/me', { auth: 'required' });
}

export function onboardVideochat(input: {
  birthDate: string;
  acceptTerms: true;
  termsVersion: string;
}) {
  return apiFetch<VideochatStatus>('/videochat/me', {
    method: 'PUT',
    body: input,
    auth: 'required',
  });
}

export function saveVideochatSettings(input: VideochatSettings) {
  return apiFetch<VideochatSettings>('/videochat/profile', {
    method: 'PUT',
    body: input,
    auth: 'required',
  });
}

export function subscribeVideochatPush(input: PushSubscriptionInput) {
  return apiFetch<void>('/videochat/push', {
    method: 'PUT',
    body: input,
    auth: 'required',
    forwardClientIp: true,
  });
}

/** A mutual contact (architecture 4.7). */
export type VideochatContact = {
  contactId: string;
  nickname: string | null;
  gender: Gender | null;
  country: string | null;
  language: string | null;
  interests: string[];
  /** In the video chat now… */
  online: boolean;
  /** …and in a call. */
  busy: boolean;
  since: string;
};

export function listVideochatContacts() {
  return apiFetch<{ items: VideochatContact[] }>('/videochat/contacts', { auth: 'required' });
}

/** Stops being their contact (my like goes). */
export function removeVideochatContact(contactId: string) {
  return apiFetch<void>(`/videochat/contacts/${encodeURIComponent(contactId)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

export function unsubscribeVideochatPush(endpoint: string) {
  return apiFetch<void>('/videochat/push', {
    method: 'DELETE',
    body: { endpoint },
    auth: 'required',
  });
}

export function appealVideochatSuspension(message: string) {
  return apiFetch<void>('/videochat/appeal', {
    method: 'POST',
    body: { message },
    auth: 'required',
    forwardClientIp: true,
  });
}

/** People in the video chat now (public; null when the API can't be reached). */
export async function getVideochatOnline(): Promise<number | null> {
  try {
    return (await apiFetch<{ online: number }>('/videochat/online', { cache: 'no-store' })).online;
  } catch {
    return null;
  }
}

export function createVideochatTicket() {
  return apiFetch<VideochatTicket>('/videochat/ticket', {
    method: 'POST',
    auth: 'required',
    forwardClientIp: true,
  });
}

export function listVideochatReports(status: ReportStatus) {
  return apiFetch<VideochatReport[]>('/admin/videochat/reports', {
    query: { status },
    auth: 'required',
  });
}

export function dismissVideochatReport(id: string) {
  return apiFetch<void>(`/admin/videochat/reports/${encodeURIComponent(id)}/dismiss`, {
    method: 'POST',
    auth: 'required',
  });
}

export function suspendFromVideochatReport(
  id: string,
  duration: SuspensionDuration,
  reason?: string,
) {
  return apiFetch<void>(`/admin/videochat/reports/${encodeURIComponent(id)}/suspend`, {
    method: 'POST',
    body: reason ? { reason, duration } : { duration },
    auth: 'required',
  });
}

export function suspendVideochatUser(
  userId: string,
  input: { reason: string; duration: SuspensionDuration },
) {
  return apiFetch<void>(`/admin/videochat/users/${encodeURIComponent(userId)}/suspend`, {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

/** Null when the person never joined the video chat. */
export async function getVideochatUser(userId: string): Promise<VideochatUserDetail | null> {
  try {
    return await apiFetch<VideochatUserDetail>(
      `/admin/videochat/users/${encodeURIComponent(userId)}`,
      { auth: 'required' },
    );
  } catch (error) {
    if (isApiError(error) && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}

export function listVideochatAppeals(status: AppealStatus) {
  return apiFetch<VideochatAppeal[]>('/admin/videochat/appeals', {
    query: { status },
    auth: 'required',
  });
}

export function resolveVideochatAppeal(id: string, accept: boolean, response?: string) {
  const path = `/admin/videochat/appeals/${encodeURIComponent(id)}/${accept ? 'accept' : 'reject'}`;
  return apiFetch<void>(path, {
    method: 'POST',
    body: response ? { response } : {},
    auth: 'required',
  });
}

export function listVideochatSuspensions() {
  return apiFetch<VideochatSuspension[]>('/admin/videochat/suspensions', { auth: 'required' });
}

export function liftVideochatSuspension(userId: string) {
  return apiFetch<void>(`/admin/videochat/suspensions/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

export function setVideochatAgeVerified(userId: string, verified: boolean) {
  return apiFetch<void>(`/admin/videochat/users/${encodeURIComponent(userId)}/age-verification`, {
    method: verified ? 'PUT' : 'DELETE',
    auth: 'required',
  });
}

export function getVideochatStats() {
  return apiFetch<VideochatStats>('/admin/videochat/stats', { auth: 'required' });
}

export const HISTORY_PERIODS = [7, 30, 90] as const;
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];

export type VideochatHistoryDay = {
  /** `yyyy-mm-dd` in Europe/Madrid. */
  date: string;
  activeUsers: number;
  newMembers: number;
  calls: number;
  /** Calls of a minute or more. */
  longCalls: number;
  avgDurationSec: number | null;
  avgWaitSec: number | null;
  reports: number;
};

export type VideochatHistory = {
  days: VideochatHistoryDay[];
  /** Calls started in each hour (0–23, Europe/Madrid). */
  hours: number[];
  totals: Omit<VideochatHistoryDay, 'date'> & {
    members: number;
    openReports: number;
    suspended: number;
  };
};

/** Usage over the last 7, 30 or 90 days (architecture 4.7). */
export function getVideochatHistory(days: HistoryPeriod) {
  return apiFetch<VideochatHistory>(`/admin/videochat/stats/history?days=${days}`, {
    auth: 'required',
  });
}
