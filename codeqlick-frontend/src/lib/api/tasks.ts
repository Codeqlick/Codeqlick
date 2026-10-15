import 'server-only';
import { apiFetch } from './client';
import type { ProjectTask, TaskStatus } from './types';

const path = (scope: 'portal' | 'admin', projectId: string, taskId?: string) =>
  `/${scope}/projects/${encodeURIComponent(projectId)}/tasks${taskId ? `/${encodeURIComponent(taskId)}` : ''}`;

export function adminListTasks(projectId: string) {
  return apiFetch<ProjectTask[]>(path('admin', projectId), { auth: 'required' });
}

export function adminCreateTask(
  projectId: string,
  input: { title: string; description: string | null },
) {
  return apiFetch<ProjectTask>(path('admin', projectId), {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

export function adminSetTaskStatus(projectId: string, taskId: string, status: TaskStatus) {
  return apiFetch<ProjectTask>(path('admin', projectId, taskId), {
    method: 'PATCH',
    body: { status },
    auth: 'required',
  });
}

export function adminDeleteTask(projectId: string, taskId: string) {
  return apiFetch<void>(path('admin', projectId, taskId), { method: 'DELETE', auth: 'required' });
}

/** Turns a support request into a task (on its project unless `projectId` says otherwise). */
export function adminTaskFromTicket(ticketId: string, input: { projectId?: string }) {
  return apiFetch<ProjectTask>(`/admin/tickets/${encodeURIComponent(ticketId)}/task`, {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

/** The client's view: titles and statuses. */
export function listMyProjectTasks(projectId: string) {
  return apiFetch<ProjectTask[]>(path('portal', projectId), { auth: 'required' });
}
