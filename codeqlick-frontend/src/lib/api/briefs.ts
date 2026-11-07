import 'server-only';
import type { BriefAnswers, ProjectBrief } from '@/lib/brief';
import { apiFetch } from './client';

const path = (scope: 'portal' | 'admin', projectId: string) =>
  `/${scope}/projects/${encodeURIComponent(projectId)}/brief`;

export function getMyBrief(projectId: string) {
  return apiFetch<ProjectBrief>(path('portal', projectId), { auth: 'required' });
}

export function saveMyBrief(projectId: string, answers: BriefAnswers, submit: boolean) {
  return apiFetch<ProjectBrief>(path('portal', projectId), {
    method: 'PUT',
    body: { answers, submit },
    auth: 'required',
  });
}

export function adminGetBrief(projectId: string) {
  return apiFetch<ProjectBrief>(path('admin', projectId), { auth: 'required' });
}

export function adminRequestBrief(projectId: string) {
  return apiFetch<ProjectBrief>(`${path('admin', projectId)}/request`, {
    method: 'POST',
    auth: 'required',
  });
}
