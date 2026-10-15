import 'server-only';
import { apiFetch } from './client';
import type { AdminStats, AdminTimeline, SiteVisits } from './types';

export function getAdminStats() {
  return apiFetch<AdminStats>('/admin/stats', { auth: 'required' });
}

export function getAdminTimeline(months = 12) {
  return apiFetch<AdminTimeline>('/admin/stats/timeline', {
    auth: 'required',
    query: { months },
  });
}

/** The public site's visits (from Umami) over the last 7, 30 or 90 days. */
export function getSiteVisits(days: 7 | 30 | 90) {
  return apiFetch<SiteVisits>('/admin/stats/visits', { auth: 'required', query: { days } });
}
