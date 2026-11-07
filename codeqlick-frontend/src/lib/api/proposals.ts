import 'server-only';
import { apiFetch } from './client';
import type { Paginated, Proposal, ProposalInput, ProposalStatus, ProposalTemplate } from './types';

const path = (scope: 'portal' | 'admin', id?: string) =>
  `/${scope}/proposals${id ? `/${encodeURIComponent(id)}` : ''}`;

/* Portal: the proposals sent to the caller. */

export function listMyProposals(params: { page?: number } = {}) {
  return apiFetch<Paginated<Proposal>>(path('portal'), {
    auth: 'required',
    query: { page: params.page, pageSize: 20 },
  });
}

export function getMyProposal(id: string) {
  return apiFetch<Proposal>(path('portal', id), { auth: 'required' });
}

export function acceptProposal(id: string, name: string) {
  return apiFetch<Proposal>(`${path('portal', id)}/accept`, {
    method: 'POST',
    body: { name },
    auth: 'required',
  });
}

export function declineProposal(id: string, reason: string | null) {
  return apiFetch<Proposal>(`${path('portal', id)}/decline`, {
    method: 'POST',
    body: { reason },
    auth: 'required',
  });
}

/* Admin. */

export function adminListProposals(params: {
  status?: ProposalStatus;
  clientId?: string;
  page?: number;
}) {
  return apiFetch<Paginated<Proposal>>(path('admin'), {
    auth: 'required',
    query: { status: params.status, clientId: params.clientId, page: params.page, pageSize: 20 },
  });
}

export function adminGetProposal(id: string) {
  return apiFetch<Proposal>(path('admin', id), { auth: 'required' });
}

export function adminCreateProposal(input: ProposalInput & { clientId: string }) {
  return apiFetch<Proposal>(path('admin'), { method: 'POST', body: input, auth: 'required' });
}

export function adminUpdateProposal(id: string, input: ProposalInput) {
  return apiFetch<Proposal>(path('admin', id), { method: 'PUT', body: input, auth: 'required' });
}

export function adminSendProposal(id: string) {
  return apiFetch<Proposal & { clientNotified: boolean }>(`${path('admin', id)}/send`, {
    method: 'POST',
    auth: 'required',
  });
}

export function adminWithdrawProposal(id: string) {
  return apiFetch<Proposal>(`${path('admin', id)}/withdraw`, { method: 'POST', auth: 'required' });
}

export function adminDuplicateProposal(id: string) {
  return apiFetch<Proposal>(`${path('admin', id)}/duplicate`, { method: 'POST', auth: 'required' });
}

export function adminDeleteProposal(id: string) {
  return apiFetch<void>(path('admin', id), { method: 'DELETE', auth: 'required' });
}

/* Templates: what a new proposal can start from. */

export function adminListProposalTemplates() {
  return apiFetch<ProposalTemplate[]>('/admin/proposal-templates', { auth: 'required' });
}

/** Saves the proposal's content as a template (replacing one with the same name). */
export function adminSaveProposalAsTemplate(id: string, name: string) {
  return apiFetch<ProposalTemplate>(`${path('admin', id)}/template`, {
    method: 'POST',
    body: { name },
    auth: 'required',
  });
}

export function adminDeleteProposalTemplate(id: string) {
  return apiFetch<void>(`/admin/proposal-templates/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}
