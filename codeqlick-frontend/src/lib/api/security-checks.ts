import 'server-only';
import { apiFetch } from './client';
import type { Paginated } from './types';

export type SecurityCheckGroupKey = 'https' | 'headers' | 'page' | 'dns-email' | 'security-txt';
export type SecurityCheckStatus = 'pass' | 'warn' | 'fail' | 'info';
export type SecurityCheckRunStatus = 'PENDING' | 'DONE' | 'FAILED';

export const SECURITY_CHECK_RUN_STATUSES: readonly SecurityCheckRunStatus[] = [
  'PENDING',
  'DONE',
  'FAILED',
];

/** GET /v1/security-checks/:id: the free Security check's report (architecture 4.19). */
export interface SecurityCheckReport {
  id: string;
  domain: string;
  status: SecurityCheckRunStatus;
  score: number | null;
  /** A+ … F; null until DONE. */
  grade: string | null;
  /** Why it couldn't be checked, in the language asked (FAILED only). */
  failure: string | null;
  groups: Array<{
    key: SecurityCheckGroupKey;
    name: string;
    /** Worst first. */
    checks: Array<{
      id: string;
      status: SecurityCheckStatus;
      title: string;
      explanation: string;
      advice: string;
    }>;
  }>;
  createdAt: string;
  finishedAt: string | null;
}

/** GET /v1/admin/security-checks item. */
export interface AdminSecurityCheck {
  id: string;
  domain: string;
  email: string;
  name: string | null;
  status: SecurityCheckRunStatus;
  score: number | null;
  grade: string | null;
  leadId: string | null;
  createdAt: string;
}

/** Asks for a check; it runs in the background and is emailed. */
export function createSecurityCheck(input: {
  domain: string;
  email: string;
  name?: string;
  locale: 'es' | 'en';
  acceptPrivacy: true;
}) {
  return apiFetch<{ id: string }>('/security-checks', {
    method: 'POST',
    body: input,
    forwardClientIp: true,
  });
}

export function getSecurityCheck(id: string, locale: 'es' | 'en') {
  return apiFetch<SecurityCheckReport>(`/security-checks/${encodeURIComponent(id)}`, {
    query: { locale },
  });
}

export function adminListSecurityChecks(
  params: { status?: SecurityCheckRunStatus; page?: number; pageSize?: number } = {},
) {
  return apiFetch<Paginated<AdminSecurityCheck>>('/admin/security-checks', {
    auth: 'required',
    query: { status: params.status, page: params.page, pageSize: params.pageSize },
  });
}
