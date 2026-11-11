import 'server-only';
import { apiFetch } from './client';

export type SiteAuditCategory = 'speed' | 'mobile' | 'seo' | 'security';
export type SiteAuditCheckStatus = 'pass' | 'warn' | 'fail';

/** GET /v1/site-audits/:id: the free website check's report (architecture 4.12). */
export interface SiteAuditReport {
  id: string;
  url: string;
  finalUrl: string | null;
  status: 'PENDING' | 'DONE' | 'FAILED';
  score: number | null;
  /** Why it couldn't be checked, in the language asked (FAILED only). */
  failure: string | null;
  categories: Array<{
    key: SiteAuditCategory;
    name: string;
    score: number;
    /** Worst first. */
    checks: Array<{ id: string; status: SiteAuditCheckStatus; title: string; advice: string }>;
  }>;
  createdAt: string;
  finishedAt: string | null;
}

/** Asks for a check; it runs in the background and is emailed. */
export function createSiteAudit(input: {
  url: string;
  email: string;
  name?: string;
  locale: 'es' | 'en';
  acceptPrivacy: true;
}) {
  return apiFetch<{ id: string }>('/site-audits', {
    method: 'POST',
    body: input,
    forwardClientIp: true,
  });
}

export function getSiteAudit(id: string, locale: 'es' | 'en') {
  return apiFetch<SiteAuditReport>(`/site-audits/${encodeURIComponent(id)}`, { query: { locale } });
}
