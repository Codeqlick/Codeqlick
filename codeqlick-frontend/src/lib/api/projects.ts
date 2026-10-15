import 'server-only';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/constants';
import { env } from '@/lib/env';
import { apiFetch } from './client';
import type { ClientProject, Paginated, ProjectInput, ProjectUpdate } from './types';

/** Largest project file the API accepts, in bytes. */
export const MAX_PROJECT_FILE_BYTES = 25 * 1024 * 1024;

/* Client portal: the caller's own projects. */

export function listMyProjects() {
  return apiFetch<ClientProject[]>('/portal/projects', { auth: 'required' });
}

export function getMyProject(id: string) {
  return apiFetch<ClientProject>(`/portal/projects/${encodeURIComponent(id)}`, {
    auth: 'required',
  });
}

/* Admin. */

export function adminListProjects(params: { page?: number; pageSize?: number } = {}) {
  return apiFetch<Paginated<ClientProject>>('/admin/projects', {
    auth: 'required',
    query: { page: params.page, pageSize: params.pageSize },
  });
}

export function adminGetProject(id: string) {
  return apiFetch<ClientProject>(`/admin/projects/${encodeURIComponent(id)}`, {
    auth: 'required',
  });
}

export function adminCreateProject(input: ProjectInput) {
  return apiFetch<ClientProject>('/admin/projects', {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

export function adminUpdateProject(id: string, input: Partial<ProjectInput>) {
  return apiFetch<ClientProject>(`/admin/projects/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    auth: 'required',
  });
}

export function adminDeleteProject(id: string) {
  return apiFetch<void>(`/admin/projects/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

/** With `notifyClient`, `clientNotified` in the answer says whether the client was emailed. */
export function adminCreateProjectUpdate(
  id: string,
  input: { title: string; body: string; notifyClient: boolean },
) {
  return apiFetch<ProjectUpdate & { clientNotified?: boolean }>(
    `/admin/projects/${encodeURIComponent(id)}/updates`,
    {
      method: 'POST',
      body: input,
      auth: 'required',
    },
  );
}

export function adminDeleteProjectFile(id: string, fileId: string) {
  return apiFetch<void>(
    `/admin/projects/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`,
    { method: 'DELETE', auth: 'required' },
  );
}

/*
 * Project files travel as streams, so these two return the raw API response instead of going
 * through apiFetch (which reads whole bodies). Both resolve to undefined without a session.
 */

async function authHeader(): Promise<string | undefined> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  return token ? `Bearer ${token}` : undefined;
}

/** Forwards a multipart upload (one `file` field) to the API without buffering it. */
export async function adminUploadProjectFile(
  id: string,
  body: ReadableStream<Uint8Array>,
  contentType: string,
): Promise<Response | undefined> {
  const authorization = await authHeader();
  if (!authorization) return undefined;
  return fetch(`${env.API_URL}/admin/projects/${encodeURIComponent(id)}/files`, {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': contentType },
    body,
    // Required by Node's fetch for a streamed request body.
    duplex: 'half',
    cache: 'no-store',
    // The body arrives at the visitor's upload speed.
    signal: AbortSignal.timeout(15 * 60_000),
  } as RequestInit);
}

/** The API's download response for a project file (client of the project, or admin). */
export async function downloadProjectFile(
  id: string,
  fileId: string,
): Promise<Response | undefined> {
  const authorization = await authHeader();
  if (!authorization) return undefined;
  return fetch(
    `${env.API_URL}/portal/projects/${encodeURIComponent(id)}/files/${encodeURIComponent(fileId)}`,
    { headers: { Authorization: authorization }, cache: 'no-store' },
  );
}
