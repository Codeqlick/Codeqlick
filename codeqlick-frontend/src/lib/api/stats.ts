import 'server-only';
import { apiFetch } from './client';
import type { AdminStats, AdminTimeline } from './types';

export function getAdminStats() {
  return apiFetch<AdminStats>('/admin/stats', { auth: 'required' });
}

export function getAdminTimeline(months = 12) {
  return apiFetch<AdminTimeline>('/admin/stats/timeline', {
    auth: 'required',
    query: { months },
  });
}
