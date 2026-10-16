import 'server-only';
import { apiFetch } from './client';
import type { MaintenancePlan, PlanSummary } from './types';

const path = (scope: 'portal' | 'admin', projectId: string) =>
  `/${scope}/projects/${encodeURIComponent(projectId)}/plan`;

/** `{ active: false }` when the project never had one. */
export function adminGetPlan(projectId: string) {
  return apiFetch<MaintenancePlan | { active: false }>(path('admin', projectId), {
    auth: 'required',
  });
}

export function adminSavePlan(
  projectId: string,
  input: { active: boolean; name: string; monthlyMinutes: number; alertPercent: number },
) {
  return apiFetch<MaintenancePlan>(path('admin', projectId), {
    method: 'PUT',
    body: input,
    auth: 'required',
  });
}

export function adminPlansOverview(month?: string) {
  return apiFetch<{ month: string; plans: PlanSummary[] }>('/admin/plans', {
    auth: 'required',
    query: { month },
  });
}

/** The client's view; 404 unless the project has an active plan. */
export function getMyPlan(projectId: string) {
  return apiFetch<MaintenancePlan>(path('portal', projectId), { auth: 'required' });
}
