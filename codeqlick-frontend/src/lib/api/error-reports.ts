import 'server-only';
import { apiFetch } from './client';

export type ErrorSource = 'API' | 'WEB_SERVER' | 'WEB_BROWSER';

/** One unexpected error, grouped with its repeats (Admin → Errors, architecture 4.11). */
export type ErrorGroup = {
  id: string;
  source: ErrorSource;
  message: string;
  stack: string | null;
  method: string | null;
  path: string | null;
  /** The API's request id or Next.js's digest of the last occurrence. */
  reference: string | null;
  userAgent: string | null;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
};

export type ErrorReport = {
  source: 'server' | 'browser';
  message: string;
  stack?: string;
  method?: string;
  path?: string;
  digest?: string;
  userAgent?: string;
};

/** A browser's error, from the Server Action (the visitor's IP is forwarded for the rate limit). */
export function reportError(report: ErrorReport) {
  return apiFetch<void>('/errors', { method: 'POST', body: report, forwardClientIp: true });
}

export function adminListErrors(status: 'open' | 'resolved') {
  return apiFetch<ErrorGroup[]>('/admin/errors', { query: { status }, auth: 'required' });
}

export function adminGetError(id: string) {
  return apiFetch<ErrorGroup>(`/admin/errors/${encodeURIComponent(id)}`, { auth: 'required' });
}

export function adminSetErrorResolved(id: string, resolved: boolean) {
  return apiFetch<ErrorGroup>(
    `/admin/errors/${encodeURIComponent(id)}/${resolved ? 'resolve' : 'reopen'}`,
    { method: 'POST', auth: 'required' },
  );
}

export function adminResolveAllErrors() {
  return apiFetch<{ resolved: number }>('/admin/errors/resolve-all', {
    method: 'POST',
    auth: 'required',
  });
}
