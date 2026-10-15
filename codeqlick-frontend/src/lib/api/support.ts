import 'server-only';
import { env } from '@/lib/env';
import { apiFetch } from './client';
import { authHeader } from './projects';
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

/* Files: uploads are streamed by a route handler (as project files), for the client or an admin. */

/** Largest file the API accepts on a request, in bytes. */
export const MAX_TICKET_FILE_BYTES = 25 * 1024 * 1024;

export async function uploadTicketFile(
  id: string,
  body: ReadableStream<Uint8Array>,
  contentType: string,
): Promise<Response | undefined> {
  const authorization = await authHeader();
  if (!authorization) return undefined;
  return fetch(`${env.API_URL}${path('portal', id)}/files`, {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': contentType },
    body,
    // Required by Node's fetch for a streamed request body.
    duplex: 'half',
    cache: 'no-store',
    // The body arrives at the visitor's upload speed.
    signal: AbortSignal.timeout(15 * 60_000),
  } as RequestInit);
}

/** The API's download response for a request's file (its client, or an admin). */
export async function downloadTicketFile(
  id: string,
  fileId: string,
): Promise<Response | undefined> {
  const authorization = await authHeader();
  if (!authorization) return undefined;
  return fetch(`${env.API_URL}${path('portal', id)}/files/${encodeURIComponent(fileId)}`, {
    headers: { Authorization: authorization },
    cache: 'no-store',
  });
}

export function adminDeleteTicketFile(id: string, fileId: string) {
  return apiFetch<void>(`${path('admin', id)}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}
