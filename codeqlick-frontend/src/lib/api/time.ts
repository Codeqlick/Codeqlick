import 'server-only';
import { apiFetch } from './client';
import type { MonthTime, ProjectTime, TimeEntry } from './types';

const projectPath = (scope: 'portal' | 'admin', id: string) =>
  `/${scope}/projects/${encodeURIComponent(id)}/time`;

export function adminGetProjectTime(projectId: string) {
  return apiFetch<ProjectTime>(projectPath('admin', projectId), { auth: 'required' });
}

export function adminLogTime(
  projectId: string,
  input: { date: string; minutes: number; description: string },
) {
  return apiFetch<TimeEntry>(projectPath('admin', projectId), {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

export function adminDeleteTime(projectId: string, entryId: string) {
  return apiFetch<void>(`${projectPath('admin', projectId)}/${encodeURIComponent(entryId)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

/** `month`: `yyyy-mm`; the current month when left out. */
export function adminGetMonthTime(month?: string) {
  return apiFetch<MonthTime>('/admin/time', { auth: 'required', query: { month } });
}

/** The client's view; 404 unless the project shows its hours. */
export function getMyProjectTime(projectId: string) {
  return apiFetch<ProjectTime>(projectPath('portal', projectId), { auth: 'required' });
}
