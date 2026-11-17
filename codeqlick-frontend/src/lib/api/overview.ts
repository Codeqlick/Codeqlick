import 'server-only';
import type { AdminOverview } from '@/lib/admin-overview';
import { apiFetch } from './client';

/** The whole platform at a glance (architecture 4.17, decision 122), cached 10 minutes by the API. */
export function getAdminOverview() {
  return apiFetch<AdminOverview>('/admin/overview', { auth: 'required' });
}
