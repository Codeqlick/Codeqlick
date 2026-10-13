import 'server-only';
import { apiFetch } from './client';
import type { ClientProject, Paginated, ProjectInput, ProjectUpdate } from './types';

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

export function adminCreateProjectUpdate(id: string, input: { title: string; body: string }) {
  return apiFetch<ProjectUpdate>(`/admin/projects/${encodeURIComponent(id)}/updates`, {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}
