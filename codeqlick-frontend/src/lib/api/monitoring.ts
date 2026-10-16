import 'server-only';
import { apiFetch } from './client';
import type { SiteMonitor } from './types';

const path = (projectId: string) => `/admin/projects/${encodeURIComponent(projectId)}/monitor`;

export function adminListMonitors() {
  return apiFetch<SiteMonitor[]>('/admin/monitoring', { auth: 'required' });
}

/** `{ enabled: false }` when the project was never monitored. */
export function adminGetMonitor(projectId: string) {
  return apiFetch<SiteMonitor | { enabled: false }>(path(projectId), { auth: 'required' });
}

export function adminSetMonitor(projectId: string, enabled: boolean) {
  return apiFetch<SiteMonitor>(path(projectId), {
    method: 'PUT',
    body: { enabled },
    auth: 'required',
  });
}

export function adminCheckNow(projectId: string) {
  return apiFetch<SiteMonitor>(`${path(projectId)}/check`, { method: 'POST', auth: 'required' });
}

/** The client's view; 404 unless monitored. */
export function getMyProjectStatus(projectId: string) {
  return apiFetch<SiteMonitor>(`/portal/projects/${encodeURIComponent(projectId)}/status`, {
    auth: 'required',
  });
}
