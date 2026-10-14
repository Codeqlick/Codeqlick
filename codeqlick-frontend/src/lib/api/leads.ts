import 'server-only';
import { apiFetch } from './client';
import type { Lead, LeadInput, LeadStatus, Paginated } from './types';

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

export function adminUpdateLead(id: string, input: { status?: LeadStatus; notes?: string | null }) {
  return apiFetch<Lead>(`/admin/leads/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    auth: 'required',
  });
}
