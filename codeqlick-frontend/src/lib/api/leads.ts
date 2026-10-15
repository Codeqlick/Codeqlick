import 'server-only';
import { apiFetch } from './client';
import type { Lead, LeadInput, LeadReply, LeadStatus, LostReason, Paginated } from './types';

export function createLead(input: LeadInput) {
  return apiFetch<{ id: string }>('/leads', {
    method: 'POST',
    body: input,
    forwardClientIp: true,
  });
}

/** Every lead matching the filters, as CSV text. */
export function adminExportLeadsCsv(params: { status?: LeadStatus; q?: string } = {}) {
  return apiFetch<string>('/admin/leads/export.csv', {
    auth: 'required',
    query: { status: params.status, q: params.q },
    responseType: 'text',
    // Exports can be large; give them longer than the default 10 s.
    signal: AbortSignal.timeout(60_000),
  });
}

export function adminListLeads(
  params: { status?: LeadStatus; q?: string; page?: number; pageSize?: number } = {},
) {
  return apiFetch<Paginated<Lead>>('/admin/leads', {
    auth: 'required',
    query: { status: params.status, q: params.q, page: params.page, pageSize: params.pageSize },
  });
}

export function adminGetLead(id: string) {
  return apiFetch<Lead>(`/admin/leads/${encodeURIComponent(id)}`, { auth: 'required' });
}

/** Replies sent to the lead, oldest first. */
export function adminListLeadReplies(id: string) {
  return apiFetch<LeadReply[]>(`/admin/leads/${encodeURIComponent(id)}/replies`, {
    auth: 'required',
  });
}

/** Emails an answer to the lead; a 503 means it couldn't be sent (and nothing was stored). */
export function adminReplyToLead(id: string, input: { subject: string; body: string }) {
  return apiFetch<{ reply: LeadReply; lead: Lead }>(
    `/admin/leads/${encodeURIComponent(id)}/replies`,
    { method: 'POST', body: input, auth: 'required' },
  );
}

export function adminUpdateLead(
  id: string,
  input: {
    status?: LeadStatus;
    notes?: string | null;
    lostReason?: LostReason | null;
    followUpOn?: string | null;
  },
) {
  return apiFetch<Lead>(`/admin/leads/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    auth: 'required',
  });
}

/** "Convert to client": a client account (welcome email), a project in Discovery, the lead won. */
export function adminConvertLead(id: string, input: { projectName?: string }) {
  return apiFetch<{
    lead: Lead;
    client: { id: string; created: boolean; invitationSent?: boolean };
    project: { id: string; name: string };
  }>(`/admin/leads/${encodeURIComponent(id)}/convert`, {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}
