import 'server-only';
import { apiFetch } from './client';
import type { SharedAccess } from './types';

const path = (projectId: string) => `/portal/projects/${encodeURIComponent(projectId)}/credentials`;

export function listAccess(projectId: string) {
  return apiFetch<SharedAccess[]>(path(projectId), { auth: 'required' });
}

export function shareAccess(
  projectId: string,
  input: { label: string; url?: string; username?: string; secret: string; notes?: string },
) {
  return apiFetch<SharedAccess>(path(projectId), { method: 'POST', body: input, auth: 'required' });
}

export function deleteAccess(projectId: string, id: string) {
  return apiFetch<void>(`${path(projectId)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

export function adminRevealAccess(projectId: string, id: string) {
  return apiFetch<{ secret: string; notes: string | null }>(
    `/admin/projects/${encodeURIComponent(projectId)}/credentials/${encodeURIComponent(id)}/reveal`,
    { method: 'POST', auth: 'required' },
  );
}

export function adminDeleteAllAccess(projectId: string) {
  return apiFetch<{ deleted: number }>(
    `/admin/projects/${encodeURIComponent(projectId)}/credentials`,
    { method: 'DELETE', auth: 'required' },
  );
}
