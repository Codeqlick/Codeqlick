import 'server-only';
import { apiFetch } from './client';
import type { SiteForm } from './types';

const path = (projectId: string) => `/admin/projects/${encodeURIComponent(projectId)}/form`;

/** `{ enabled: false }` when the project never had one. */
export function adminGetSiteForm(projectId: string) {
  return apiFetch<SiteForm | { enabled: false }>(path(projectId), { auth: 'required' });
}

export function adminSaveSiteForm(
  projectId: string,
  input: { enabled: boolean; recipients: string[] },
) {
  return apiFetch<SiteForm>(path(projectId), { method: 'PUT', body: input, auth: 'required' });
}

export function adminReplaceSiteFormKey(projectId: string) {
  return apiFetch<SiteForm>(`${path(projectId)}/key`, { method: 'POST', auth: 'required' });
}
