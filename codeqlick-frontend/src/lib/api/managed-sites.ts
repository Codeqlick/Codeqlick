import 'server-only';
import { apiFetch } from './client';
import type { ManagedSite, ManagedSiteRevision } from './types';

const path = (projectId: string) => `/admin/projects/${encodeURIComponent(projectId)}/site`;

export function adminListSites() {
  return apiFetch<ManagedSite[]>('/admin/sites', { auth: 'required' });
}

/** `{ exists: false }` when the project has no managed site. */
export function adminGetSite(projectId: string) {
  return apiFetch<ManagedSite | { exists: false }>(path(projectId), { auth: 'required' });
}

export function adminCreateSite(
  projectId: string,
  input: { slug: string; preset: string; domain?: string | null },
) {
  return apiFetch<ManagedSite>(path(projectId), { method: 'POST', body: input, auth: 'required' });
}

export function adminUpdateSite(projectId: string, input: { domain: string | null }) {
  return apiFetch<ManagedSite>(path(projectId), { method: 'PATCH', body: input, auth: 'required' });
}

export function adminSaveSiteContent(projectId: string, content: unknown) {
  return apiFetch<ManagedSite>(`${path(projectId)}/content`, {
    method: 'PUT',
    body: { content },
    auth: 'required',
  });
}

export function adminBuildSite(projectId: string) {
  return apiFetch<ManagedSite>(`${path(projectId)}/build`, { method: 'POST', auth: 'required' });
}

export function adminSiteRevisions(projectId: string) {
  return apiFetch<ManagedSiteRevision[]>(`${path(projectId)}/revisions`, { auth: 'required' });
}

export function adminRestoreSiteRevision(projectId: string, revisionId: string) {
  return apiFetch<ManagedSite>(
    `${path(projectId)}/revisions/${encodeURIComponent(revisionId)}/restore`,
    { method: 'POST', auth: 'required' },
  );
}
