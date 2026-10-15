import 'server-only';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/constants';
import { env } from '@/lib/env';
import { apiFetch } from './client';
import type {
  ClientProject,
  MilestoneInput,
  Paginated,
  ProjectInput,
  ProjectMilestone,
  ProjectUpdate,
  ReleaseEnvironment,
  UpdateDraft,
  UpdateComment,
} from './types';

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

function updatePath(scope: 'portal' | 'admin', id: string, updateId: string) {
  return `/${scope}/projects/${encodeURIComponent(id)}/updates/${encodeURIComponent(updateId)}`;
}

/** The client (or an admin in the portal) comments on an update. */
export function addUpdateComment(id: string, updateId: string, body: string) {
  return apiFetch<UpdateComment>(`${updatePath('portal', id, updateId)}/comments`, {
    method: 'POST',
    body: { body },
    auth: 'required',
  });
}

/** The client approves an update that asks for it. */
export function approveUpdate(id: string, updateId: string) {
  return apiFetch<ProjectUpdate>(`${updatePath('portal', id, updateId)}/approval`, {
    method: 'POST',
    auth: 'required',
  });
}

/* Admin. */

/** The team answers on an update; `clientNotified` says whether the client was emailed. */
export function adminAddUpdateComment(id: string, updateId: string, body: string) {
  return apiFetch<UpdateComment & { clientNotified: boolean }>(
    `${updatePath('admin', id, updateId)}/comments`,
    { method: 'POST', body: { body }, auth: 'required' },
  );
}

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
/** A release: an update with the version, where it went and its address. */
export function adminPublishRelease(
  id: string,
  input: {
    version: string;
    environment: ReleaseEnvironment;
    url: string | null;
    title: string;
    body: string;
    notifyClient: boolean;
    requestApproval: boolean;
  },
) {
  return apiFetch<ProjectUpdate & { clientNotified?: boolean }>(
    `/admin/projects/${encodeURIComponent(id)}/releases`,
    { method: 'POST', body: input, auth: 'required' },
  );
}

/** A new key for the project's deploy pipeline (replaces the previous one); shown only once. */
export function adminCreateReleaseKey(id: string) {
  return apiFetch<{ key: string }>(`/admin/projects/${encodeURIComponent(id)}/release-key`, {
    method: 'POST',
    auth: 'required',
  });
}

export function adminRevokeReleaseKey(id: string) {
  return apiFetch<void>(`/admin/projects/${encodeURIComponent(id)}/release-key`, {
    method: 'DELETE',
    auth: 'required',
  });
}

/** Drafts waiting for review: one project's, or every project's. */
export function adminListDrafts(projectId?: string) {
  return apiFetch<UpdateDraft[]>(
    projectId
      ? `/admin/projects/${encodeURIComponent(projectId)}/drafts`
      : '/admin/projects/drafts',
    { auth: 'required' },
  );
}

export function adminPublishDraft(
  projectId: string,
  draftId: string,
  input: {
    title: string;
    body: string;
    version: string | null;
    environment: ReleaseEnvironment | null;
    url: string | null;
    notifyClient: boolean;
    requestApproval: boolean;
  },
) {
  return apiFetch<ProjectUpdate & { clientNotified?: boolean }>(
    `/admin/projects/${encodeURIComponent(projectId)}/drafts/${encodeURIComponent(draftId)}/publish`,
    { method: 'POST', body: input, auth: 'required' },
  );
}

export function adminDiscardDraft(projectId: string, draftId: string) {
  return apiFetch<void>(
    `/admin/projects/${encodeURIComponent(projectId)}/drafts/${encodeURIComponent(draftId)}`,
    { method: 'DELETE', auth: 'required' },
  );
}

export function adminCreateProjectUpdate(
  id: string,
  input: { title: string; body: string; notifyClient: boolean; requestApproval: boolean },
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

function milestonesPath(id: string, milestoneId?: string) {
  const base = `/admin/projects/${encodeURIComponent(id)}/milestones`;
  return milestoneId ? `${base}/${encodeURIComponent(milestoneId)}` : base;
}

export function adminCreateMilestone(id: string, input: MilestoneInput) {
  return apiFetch<ProjectMilestone>(milestonesPath(id), {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

export function adminUpdateMilestone(
  id: string,
  milestoneId: string,
  input: Partial<MilestoneInput> & { completed?: boolean },
) {
  return apiFetch<ProjectMilestone>(milestonesPath(id, milestoneId), {
    method: 'PATCH',
    body: input,
    auth: 'required',
  });
}

export function adminDeleteMilestone(id: string, milestoneId: string) {
  return apiFetch<void>(milestonesPath(id, milestoneId), { method: 'DELETE', auth: 'required' });
}

/** `ids` lists every milestone of the project once, in the new order. */
export function adminReorderMilestones(id: string, ids: string[]) {
  return apiFetch<ProjectMilestone[]>(`${milestonesPath(id)}/order`, {
    method: 'PUT',
    body: { ids },
    auth: 'required',
  });
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

/** Shared with the support request uploads (lib/api/support.ts). */
export async function authHeader(): Promise<string | undefined> {
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
