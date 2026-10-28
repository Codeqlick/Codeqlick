import 'server-only';
import { apiFetch } from './client';
import type { EditableSite, PortalSite, ProjectVisits, SiteEditorView } from './types';

const path = (projectId: string) => `/portal/projects/${encodeURIComponent(projectId)}/site`;

/** The client's managed website; 404 when the project has none. */
export function getMySite(projectId: string) {
  return apiFetch<PortalSite>(path(projectId), { auth: 'required' });
}

export function saveMySite(projectId: string, site: EditableSite) {
  return apiFetch<PortalSite>(path(projectId), { method: 'PUT', body: { site }, auth: 'required' });
}

/** The client chooses or drops their own domain; 409 when another site uses it. */
export function setMySiteDomain(projectId: string, name: string | null) {
  return apiFetch<PortalSite>(`${path(projectId)}/domain`, {
    method: 'PUT',
    body: { name },
    auth: 'required',
  });
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

/** The site's visits and form messages over the last `days`; 404 without a managed site. */
export function getProjectVisits(
  projectId: string,
  days = 30,
  scope: 'portal' | 'admin' = 'portal',
) {
  return apiFetch<ProjectVisits>(`/${scope}/projects/${encodeURIComponent(projectId)}/visits`, {
    auth: 'required',
    query: { days },
  });
}

/** The website editor (architecture 8.2): the draft, or the published content without one. */
export function getSiteEditor(projectId: string) {
  return apiFetch<SiteEditorView>(`${path(projectId)}/draft`, { auth: 'required' });
}

/** Saves the draft; its preview is built when `rebuild` (400 lists every issue by path). */
export function saveSiteDraft(
  projectId: string,
  body: { content: unknown; preset?: string; rebuild?: boolean },
) {
  return apiFetch<SiteEditorView>(`${path(projectId)}/draft`, {
    method: 'PUT',
    body,
    auth: 'required',
  });
}

export function discardSiteDraft(projectId: string) {
  return apiFetch<void>(`${path(projectId)}/draft`, { method: 'DELETE', auth: 'required' });
}

export function publishSiteDraft(projectId: string) {
  return apiFetch<SiteEditorView>(`${path(projectId)}/draft/publish`, {
    method: 'POST',
    auth: 'required',
  });
}

/** The draft takes another style's colours, fonts, order and photos. */
export function applySiteStyle(projectId: string, preset: string) {
  return apiFetch<SiteEditorView>(`${path(projectId)}/draft/style`, {
    method: 'POST',
    body: { preset },
    auth: 'required',
  });
}
