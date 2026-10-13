import 'server-only';
import { apiFetch } from './client';
import type { AdminStats } from './types';

export function getAdminStats() {
  return apiFetch<AdminStats>('/admin/stats', { auth: 'required' });
}
