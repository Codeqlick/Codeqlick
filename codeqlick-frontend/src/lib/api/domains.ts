import 'server-only';
import { apiFetch } from './client';
import type { DomainAvailability, ProjectDomain } from './types';

const path = (projectId: string) => `/admin/projects/${encodeURIComponent(projectId)}/domain`;

export function adminGetDomain(projectId: string) {
  return apiFetch<ProjectDomain>(path(projectId), { auth: 'required' });
}

export function adminSaveDomain(
  projectId: string,
  input: { name: string | null; source: 'RDAP' | 'MANUAL' | 'OVH'; expiresAt?: string | null },
) {
  return apiFetch<ProjectDomain>(path(projectId), { method: 'PUT', body: input, auth: 'required' });
}

export function adminCheckDomain(projectId: string) {
  return apiFetch<ProjectDomain>(`${path(projectId)}/check`, { method: 'POST', auth: 'required' });
}

/** Whether the domains for a name are free (public, architecture 8.2); 400 for unusable names. */
export function checkDomainAvailability(name: string) {
  return apiFetch<{ results: DomainAvailability[] }>('/domains/availability', {
    query: { name },
    forwardClientIp: true,
  });
}
