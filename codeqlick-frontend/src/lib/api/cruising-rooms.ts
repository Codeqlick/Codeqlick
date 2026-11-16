import 'server-only';
import type { CruisingSuspension } from '@/lib/cruising';
import {
  NO_GRANTS,
  readRoomSnapshot,
  type AlbumGrants,
  type RoomMessage,
  type RoomSnapshot,
  type RoomSummary,
} from '@/lib/cruising-rooms';
import { apiFetch } from './client';

/**
 * Cruising's phase 6 (architecture 4.15): the private album's grants (decision 99) and the city
 * chat's rooms (decision 100). Every call is for a signed-in member who entered; the API checks
 * it again.
 */

// ---- Private album grants ----------------------------------------------------------------------

/** Who I shared my private album with (`given`) and who shared theirs with me (`received`). */
export async function getCruisingAlbumGrants(): Promise<AlbumGrants> {
  const grants = await apiFetch<Partial<AlbumGrants>>('/cruising/album-grants', {
    auth: 'required',
  });
  return {
    given: grants.given ?? NO_GRANTS.given,
    received: grants.received ?? NO_GRANTS.received,
  };
}

/** Shares my private album with a member (PUT), or takes it back (DELETE, idempotent). */
export function setCruisingAlbumGrant(nickname: string, on: boolean) {
  return apiFetch<void>(`/cruising/album-grants/${encodeURIComponent(nickname)}`, {
    method: on ? 'PUT' : 'DELETE',
    auth: 'required',
  });
}

// ---- City rooms --------------------------------------------------------------------------------

/** The rooms of my favourites' cities, my trips' cities and my country's busiest. */
export async function listCruisingRooms(): Promise<RoomSummary[]> {
  return (await apiFetch<{ items: RoomSummary[] }>('/cruising/rooms', { auth: 'required' })).items;
}

function roomPath(countryCode: string, citySlug: string): string {
  return `/cruising/rooms/${encodeURIComponent(countryCode)}/${encodeURIComponent(citySlug)}/messages`;
}

/** The last 100 messages of a room (oldest first), or those after `after`, and my posting state. */
export async function getCruisingRoom(
  countryCode: string,
  citySlug: string,
  after?: string,
): Promise<RoomSnapshot> {
  const body = await apiFetch<unknown>(roomPath(countryCode, citySlug), {
    auth: 'required',
    query: { after },
  });
  return (
    readRoomSnapshot(body) ?? { items: [], posting: { allowed: true, reason: null, until: null } }
  );
}

export function postCruisingRoomMessage(countryCode: string, citySlug: string, text: string) {
  return apiFetch<RoomMessage>(roomPath(countryCode, citySlug), {
    method: 'POST',
    body: { text },
    auth: 'required',
  });
}

// ---- Admin -------------------------------------------------------------------------------------

export function deleteAdminCruisingRoomMessage(id: string) {
  return apiFetch<void>(`/admin/cruising/room-messages/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

/** Mutes a member from the rooms for a while or for good (POST), or lifts it (DELETE). */
export function setAdminCruisingRoomMute(userId: string, duration: CruisingSuspension | null) {
  const path = `/admin/cruising/users/${encodeURIComponent(userId)}/room-mute`;
  return duration
    ? apiFetch<void>(path, { method: 'POST', body: { duration }, auth: 'required' })
    : apiFetch<void>(path, { method: 'DELETE', auth: 'required' });
}
