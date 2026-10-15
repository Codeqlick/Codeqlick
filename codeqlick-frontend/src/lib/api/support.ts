import 'server-only';
import { apiFetch } from './client';
import type {
  Paginated,
  Ticket,
  TicketDetail,
  TicketPriority,
  TicketStatus,
  TicketType,
} from './types';

const path = (scope: 'portal' | 'admin', id?: string) =>
  `/${scope}/tickets${id ? `/${encodeURIComponent(id)}` : ''}`;

/* Portal: the caller's own requests. */

export function listMyTickets(params: { page?: number } = {}) {
  return apiFetch<Paginated<Ticket>>(path('portal'), {
    auth: 'required',
    query: { page: params.page, pageSize: 20 },
  });
}

export function getMyTicket(id: string) {
  return apiFetch<TicketDetail>(path('portal', id), { auth: 'required' });
}

export function openTicket(input: {
  type: TicketType;
  priority: TicketPriority;
  title: string;
  body: string;
  projectId: string | null;
}) {
  return apiFetch<TicketDetail>(path('portal'), { method: 'POST', body: input, auth: 'required' });
}

export function replyToMyTicket(id: string, body: string) {
  return apiFetch<TicketDetail>(`${path('portal', id)}/messages`, {
    method: 'POST',
    body: { body },
    auth: 'required',
  });
}

export function closeMyTicket(id: string) {
  return apiFetch<TicketDetail>(`${path('portal', id)}/close`, {
    method: 'POST',
    auth: 'required',
  });
}

/* Admin. */

export function adminListTickets(params: {
  status?: TicketStatus;
  active?: boolean;
  page?: number;
}) {
  return apiFetch<Paginated<Ticket>>(path('admin'), {
    auth: 'required',
    query: {
      status: params.status,
      active: params.active ? 'true' : undefined,
      page: params.page,
      pageSize: 20,
    },
  });
}

export function adminGetTicket(id: string) {
  return apiFetch<TicketDetail>(path('admin', id), { auth: 'required' });
}

export function adminReplyToTicket(id: string, input: { body: string; status: TicketStatus }) {
  return apiFetch<TicketDetail>(`${path('admin', id)}/messages`, {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

export function adminUpdateTicket(
  id: string,
  input: { status?: TicketStatus; priority?: TicketPriority },
) {
  return apiFetch<TicketDetail>(path('admin', id), {
    method: 'PATCH',
    body: input,
    auth: 'required',
  });
}
