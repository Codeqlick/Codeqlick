import 'server-only';
import { apiFetch } from './client';
import type {
  Lead,
  LeadInput,
  LeadReply,
  LeadStatus,
  LostReason,
  Paginated,
  PreviewListItem,
  SitePurchase,
  SiteRequest,
} from './types';

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
    name?: string;
    email?: string | null;
    company?: string | null;
  },
) {
  return apiFetch<Lead>(`/admin/leads/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    auth: 'required',
  });
}

/** Deletes the lead; its preview is taken down. */
export function adminDeleteLead(id: string) {
  return apiFetch<void>(`/admin/leads/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

/** (Re)builds the lead's preview from its request; nobody is emailed. */
export function adminRebuildLeadPreview(id: string) {
  return apiFetch<{ status: 'BUILDING' }>(`/admin/leads/${encodeURIComponent(id)}/preview`, {
    method: 'POST',
    auth: 'required',
  });
}

/** Replaces the lead's website request and rebuilds its preview. */
export function adminEditLeadRequest(id: string, request: SiteRequest) {
  return apiFetch<Lead>(`/admin/leads/${encodeURIComponent(id)}/request`, {
    method: 'PUT',
    body: request,
    auth: 'required',
  });
}

/** Every preview, newest first. */
export function adminListPreviews() {
  return apiFetch<PreviewListItem[]>('/admin/previews', { auth: 'required' });
}

/** A prospect: the preview of a business that hasn't asked yet. */
export function adminCreatePreview(
  input: SiteRequest & { name?: string; email?: string; locale?: 'es' | 'en' },
) {
  return apiFetch<{ leadId: string }>('/admin/previews', {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

/** Takes a website request's preview down. */
export function adminRemoveLeadPreview(id: string) {
  return apiFetch<{ status: 'REMOVED' | null }>(`/admin/leads/${encodeURIComponent(id)}/preview`, {
    method: 'DELETE',
    auth: 'required',
  });
}

/** Drafts the proposal of a website request for the email's client account; the lead moves to PROPOSAL. */
export function adminProposeFromRequest(id: string) {
  return apiFetch<{
    proposalId: string;
    client: { id: string; created: boolean; invitationSent?: boolean };
  }>(`/admin/leads/${encodeURIComponent(id)}/proposal`, { method: 'POST', auth: 'required' });
}

/** "Convert to client": a client account (welcome email), a project in Discovery, the lead won. */
export function adminConvertLead(id: string, input: { projectName?: string }) {
  return apiFetch<{
    lead: Lead;
    client: { id: string; created: boolean; registered: boolean; invitationSent?: boolean };
    project: { id: string; name: string };
  }>(`/admin/leads/${encodeURIComponent(id)}/convert`, {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

/** The lead's online purchases of its preview, newest first (decision 20). */
export function adminListLeadPurchases(id: string) {
  return apiFetch<SitePurchase[]>(`/admin/leads/${encodeURIComponent(id)}/purchases`, {
    auth: 'required',
  });
}
