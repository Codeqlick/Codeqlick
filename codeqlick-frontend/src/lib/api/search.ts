import 'server-only';
import type { AppLocale } from '@/i18n/routing';
import { apiFetch } from './client';
import type { AdminSearch } from './types';

/** Same limit as every other API call, so a slow API can't hang the search. */
const TIMEOUT_MS = 10_000;

/**
 * `GET /admin/search` (architecture 4.14): leads, users, projects, requests, proposals, posts and
 * case studies matching `q`, titles in `locale`. Forwards the admin's IP (the API allows 120
 * searches a minute per IP) and stops when `signal` aborts (a newer search in the browser).
 */
export function adminSearch(q: string, locale: AppLocale, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return apiFetch<AdminSearch>('/admin/search', {
    auth: 'required',
    query: { q, locale },
    forwardClientIp: true,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
}
