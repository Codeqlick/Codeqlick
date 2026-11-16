import 'server-only';
import type { CruisingSpotSummary } from '@/lib/api/cruising';
import { formatBbox, type Bbox } from '@/lib/cruising';
import type { SafetyKind } from '@/lib/cruising-community';
import { apiFetch } from './client';

/**
 * Cruising's phase 5 (architecture 4.15): meetups (decision 88), trips (decision 90) and safety
 * alerts (decision 91). Every call is for a signed-in member who entered; the API checks it again.
 */

export type CruisingMeetup = {
  id: string;
  spot: {
    id: string;
    slug: string;
    name: string;
    city: string;
    citySlug: string;
    countryCode: string;
  };
  startsAt: string;
  endsAt: string;
  title: string;
  description: string;
  capacity: number | null;
  going: number;
  full: boolean;
  mine: boolean;
  attending: { anonymous: boolean } | null;
  host: { nickname: string; verified: boolean };
  attendees: { nickname: string; verified: boolean }[];
};

export type CruisingTrip = {
  id: string;
  countryCode: string;
  citySlug: string;
  city: string;
  from: string;
  to: string;
  listed: boolean;
  spots: (CruisingSpotSummary & { here: number })[];
  meetups: CruisingMeetup[];
};

export type CruisingVisitor = { nickname: string; verified: boolean; from: string; to: string };

export type CruisingSafetyAlert = {
  id: string;
  kind: SafetyKind;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  confirmations: number;
  mine: boolean;
  myVote: 'CONFIRM' | 'GONE' | null;
};

// ---- Meetups ---------------------------------------------------------------------------------------

/** Upcoming meetups at a spot, in a city, or (no filter) at my favourites and in my countries. */
export async function listCruisingMeetups(
  filter: { spotId?: string; countryCode?: string; citySlug?: string } = {},
): Promise<CruisingMeetup[]> {
  return (
    await apiFetch<{ items: CruisingMeetup[] }>('/cruising/meetups', {
      query: filter,
      auth: 'required',
    })
  ).items;
}

export function createCruisingMeetup(input: {
  spotId: string;
  startsAt: string;
  hours: number;
  title: string;
  description?: string;
  capacity?: number | null;
}) {
  return apiFetch<CruisingMeetup>('/cruising/meetups', {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

/** "I'm going" (`409` when full or over), or not going any more. */
export function setCruisingAttendance(meetupId: string, going: boolean, anonymous = false) {
  return apiFetch<void>(`/cruising/meetups/${encodeURIComponent(meetupId)}/attendance`, {
    method: going ? 'PUT' : 'DELETE',
    body: going ? { anonymous } : undefined,
    auth: 'required',
  });
}

/** The host cancels; the attendees are told. */
export function cancelCruisingMeetup(meetupId: string) {
  return apiFetch<void>(`/cruising/meetups/${encodeURIComponent(meetupId)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

// ---- Trips -----------------------------------------------------------------------------------------

export async function listCruisingTrips(): Promise<CruisingTrip[]> {
  return (await apiFetch<{ items: CruisingTrip[] }>('/cruising/trips', { auth: 'required' })).items;
}

export function createCruisingTrip(input: {
  countryCode: string;
  citySlug: string;
  from: string;
  to: string;
  listed: boolean;
}) {
  return apiFetch<Omit<CruisingTrip, 'spots' | 'meetups'>>('/cruising/trips', {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

export function deleteCruisingTrip(id: string) {
  return apiFetch<void>(`/cruising/trips/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

/** "Visiting soon": the listed trips to a city in the next 60 days. */
export async function listCruisingVisitors(
  countryCode: string,
  citySlug: string,
): Promise<CruisingVisitor[]> {
  return (
    await apiFetch<{ items: CruisingVisitor[] }>(
      `/cruising/places/${encodeURIComponent(countryCode)}/${encodeURIComponent(citySlug)}/visitors`,
      { auth: 'required' },
    )
  ).items;
}

// ---- Safety alerts ---------------------------------------------------------------------------------

export async function listCruisingSafetyAlerts(spotId: string): Promise<CruisingSafetyAlert[]> {
  return (
    await apiFetch<{ items: CruisingSafetyAlert[] }>(
      `/cruising/spots/${encodeURIComponent(spotId)}/alerts`,
      { auth: 'required' },
    )
  ).items;
}

export function createCruisingSafetyAlert(
  spotId: string,
  input: { kind: SafetyKind; note?: string },
) {
  return apiFetch<CruisingSafetyAlert>(`/cruising/spots/${encodeURIComponent(spotId)}/alerts`, {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

/** "Still there" or "gone"; once per member and alert. */
export function voteCruisingSafetyAlert(alertId: string, vote: 'confirm' | 'gone') {
  return apiFetch<void>(`/cruising/alerts/${encodeURIComponent(alertId)}/${vote}`, {
    method: 'POST',
    auth: 'required',
  });
}

/** The spots of a grid box with active alerts; only for a member who has entered. */
export async function listCruisingSafetyInBox(
  box: Bbox,
): Promise<{ spotId: string; alerts: number }[]> {
  return (
    await apiFetch<{ items: { spotId: string; alerts: number }[] }>('/cruising/alerts', {
      query: { bbox: formatBbox(box) },
      auth: 'required',
    })
  ).items;
}
