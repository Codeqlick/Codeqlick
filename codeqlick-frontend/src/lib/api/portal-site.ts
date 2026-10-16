import 'server-only';
import { apiFetch } from './client';
import type { EditableSite, PortalSite } from './types';

const path = (projectId: string) => `/portal/projects/${encodeURIComponent(projectId)}/site`;

/** The client's managed website; 404 when the project has none. */
export function getMySite(projectId: string) {
  return apiFetch<PortalSite>(path(projectId), { auth: 'required' });
}

export function saveMySite(projectId: string, site: EditableSite) {
  return apiFetch<PortalSite>(path(projectId), { method: 'PUT', body: { site }, auth: 'required' });
}

/** Uploads a photo; answers the `media/<file>` name the content uses. */
export function uploadMySitePhoto(projectId: string, file: File) {
  const body = new FormData();
  body.append('file', file);
  return apiFetch<{ file: string; url: string }>(`${path(projectId)}/images`, {
    method: 'POST',
    body,
    auth: 'required',
  });
}
