import 'server-only';
import { apiFetch } from './client';
import { isApiError } from './errors';

/** Meetings by link (architecture 4.8). Shapes mirror the API's meetings module. */

export type IceServer = { urls: string[]; username?: string; credential?: string };

export type MeetingRoom = {
  id: string;
  code: string;
  title: string;
  lobby: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  /** People in the meeting right now. */
  live: number;
};

export type PublicMeetingRoom = { code: string; title: string; ownerName: string; live: number };

export type MeetingTicket = {
  ticket: string;
  expiresIn: number;
  iceServers: IceServer[];
  room: { code: string; title: string };
};

export async function listMeetingRooms(): Promise<MeetingRoom[]> {
  return (await apiFetch<{ items: MeetingRoom[] }>('/meetings/rooms', { auth: 'required' })).items;
}

export function createMeetingRoom(title: string) {
  return apiFetch<MeetingRoom>('/meetings/rooms', {
    method: 'POST',
    auth: 'required',
    body: { title },
  });
}

export function updateMeetingRoom(id: string, input: { title?: string; lobby?: boolean }) {
  return apiFetch<MeetingRoom>(`/meetings/rooms/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    auth: 'required',
    body: input,
  });
}

export function deleteMeetingRoom(id: string) {
  return apiFetch<void>(`/meetings/rooms/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

/** The room behind a link, or null when there is none. */
export async function getPublicMeetingRoom(code: string): Promise<PublicMeetingRoom | null> {
  try {
    return await apiFetch<PublicMeetingRoom>(
      `/meetings/rooms/by-code/${encodeURIComponent(code)}`,
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isApiError(error) && (error.status === 404 || error.status === 400)) return null;
    throw error;
  }
}

/** A ticket with the signed-in account's name. */
export function createMeetingTicket(code: string) {
  return apiFetch<MeetingTicket>(`/meetings/rooms/${encodeURIComponent(code)}/ticket`, {
    method: 'POST',
    auth: 'required',
    forwardClientIp: true,
  });
}

/** A guest's ticket, with the name they typed. */
export function createMeetingGuestTicket(code: string, name: string) {
  return apiFetch<MeetingTicket>(`/meetings/rooms/${encodeURIComponent(code)}/guest-ticket`, {
    method: 'POST',
    body: { name },
    forwardClientIp: true,
  });
}
