import 'server-only';
import { apiFetch } from './client';

/** The video chat (architecture 4.7). Shapes mirror the API's videochat module. */

export type VideochatStatus = {
  onboarded: boolean;
  termsVersion: string;
  acceptedTermsVersion: string | null;
  suspended: boolean;
  ageVerificationRequired: boolean;
  ageVerified: boolean;
  allowed: boolean;
};

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

export type VideochatSuspension = {
  user: { id: string; name: string; email: string };
  suspendedAt: string;
  reason: string | null;
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

export function suspendFromVideochatReport(id: string, reason?: string) {
  return apiFetch<void>(`/admin/videochat/reports/${encodeURIComponent(id)}/suspend`, {
    method: 'POST',
    body: reason ? { reason } : {},
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
