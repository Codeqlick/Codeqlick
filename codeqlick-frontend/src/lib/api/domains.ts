import 'server-only';
import { apiFetch } from './client';
import type { ProjectDomain } from './types';

const path = (projectId: string) => `/admin/projects/${encodeURIComponent(projectId)}/domain`;

export function adminGetDomain(projectId: string) {
  return apiFetch<ProjectDomain>(path(projectId), { auth: 'required' });
}

export function adminSaveDomain(
  projectId: string,
  input: { name: string | null; source: 'RDAP' | 'MANUAL'; expiresAt?: string | null },
) {
  return apiFetch<ProjectDomain>(path(projectId), { method: 'PUT', body: input, auth: 'required' });
}

export function adminCheckDomain(projectId: string) {
  return apiFetch<ProjectDomain>(`${path(projectId)}/check`, { method: 'POST', auth: 'required' });
}
