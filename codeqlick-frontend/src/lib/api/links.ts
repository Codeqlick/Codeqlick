import 'server-only';
import { apiFetch } from './client';
import type { LinkCheck, LinkCheckList } from './types';

/** The links of published content checked weekly (Admin → Broken links, architecture 4.6). */
export function adminListLinks(status: 'broken' | 'all') {
  return apiFetch<LinkCheckList>('/admin/links', { query: { status }, auth: 'required' });
}

/** Checks one link now (the API allows 10 a minute) and returns it with the new result. */
export function adminCheckLink(id: string) {
  return apiFetch<LinkCheck>(`/admin/links/${encodeURIComponent(id)}/check`, {
    method: 'POST',
    auth: 'required',
  });
}
