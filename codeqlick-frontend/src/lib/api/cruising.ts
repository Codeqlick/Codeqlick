import 'server-only';
import {
  formatBbox,
  type Bbox,
  type CruisingReportReason,
  type CruisingSpotStatus,
  type CruisingSpotType,
  type CruisingSuspension,
  type CruisingTakedownReason,
  type SpotInput,
} from '@/lib/cruising';
import { apiFetch } from './client';
import { isApiError } from './errors';
import type { Paginated } from './types';

/** Cruising (architecture 4.15). Shapes mirror section 5's "Shapes" and the API's cruising module. */

export type CruisingSpotSummary = {
  id: string;
  slug: string;
  name: string;
  type: CruisingSpotType;
  lat: number;
  lng: number;
  ratingAvg: number;
  ratingCount: number;
};

export type CruisingSpotPublic = CruisingSpotSummary & {
  countryCode: string;
  city: string;
  citySlug: string;
  description: string;
  bestTimes: string | null;
  createdAt: string;
};

export type CruisingReview = {
  id: string;
  rating: number;
  text: string | null;
  mine: boolean;
  /** null: "Member" (phase 1, or a person without a nickname). */
  author: { nickname: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type CruisingStatus = {
  onboarded: boolean;
  termsVersion: string;
  acceptedTermsVersion: string | null;
  suspended: boolean;
  suspension: { reason: string | null; until: string | null } | null;
  /** Entered, current terms, not suspended. */
  allowed: boolean;
  emailAlerts: boolean;
  /** Phase 2; null until a nickname is set. */
  profile: {
    nickname: string;
    bio: string;
    country: string | null;
    lookingFor: ('CHAT' | 'FRIENDS' | 'DATES' | 'FUN' | 'GROUP')[];
    showAge: boolean;
  } | null;
};

export type CruisingPlaces = {
  countries: {
    countryCode: string;
    count: number;
    cities: { city: string; citySlug: string; count: number }[];
  }[];
};

export type CruisingCity = {
  countryCode: string;
  city: string;
  citySlug: string;
  items: CruisingSpotSummary[];
};

export type CruisingSitemapItem = {
  slug: string;
  countryCode: string;
  citySlug: string;
  updatedAt: string;
};

/**
 * A spot I proposed. The API's list names the fields above; `lat`, `lng`, `description` and
 * `bestTimes` are read when it sends them, to fill the edit form.
 */
export type MyCruisingSpot = {
  id: string;
  slug: string;
  name: string;
  type: CruisingSpotType;
  status: CruisingSpotStatus;
  rejectReason: string | null;
  countryCode: string;
  city: string;
  ratingAvg: number;
  ratingCount: number;
  createdAt: string;
  lat?: number;
  lng?: number;
  description?: string;
  bestTimes?: string | null;
};

// ---- Public ------------------------------------------------------------------------------------

/** The LIVE spots in a box (up to 500). The visitor's address is forwarded for the API's limit. */
export function listCruisingSpots(box: Bbox, type?: CruisingSpotType | null) {
  return apiFetch<{ items: CruisingSpotSummary[]; truncated: boolean }>('/cruising/spots', {
    query: { bbox: formatBbox(box), type },
    forwardClientIp: true,
  });
}

/** A LIVE spot by its slug, or null (404). */
export async function getCruisingSpot(slug: string): Promise<CruisingSpotPublic | null> {
  try {
    return await apiFetch<CruisingSpotPublic>(`/cruising/spots/${encodeURIComponent(slug)}`, {
      revalidate: 60,
    });
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

export function getCruisingPlaces() {
  return apiFetch<CruisingPlaces>('/cruising/places', { revalidate: 300 });
}

/** The LIVE spots of a city, or null when it has none (404). */
export async function getCruisingCity(
  countryCode: string,
  citySlug: string,
): Promise<CruisingCity | null> {
  try {
    return await apiFetch<CruisingCity>(
      `/cruising/places/${encodeURIComponent(countryCode)}/${encodeURIComponent(citySlug)}`,
      { revalidate: 300 },
    );
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

export async function listCruisingSitemap(): Promise<CruisingSitemapItem[]> {
  return (
    await apiFetch<{ items: CruisingSitemapItem[] }>('/cruising/sitemap', { revalidate: 300 })
  ).items;
}

export function requestCruisingTakedown(input: {
  email: string;
  spotLink?: string;
  reason: CruisingTakedownReason;
  details: string;
  locale: 'es' | 'en';
  website?: string;
}) {
  return apiFetch<{ id: string }>('/cruising/takedown', {
    method: 'POST',
    body: input,
    forwardClientIp: true,
  });
}

// ---- Members -----------------------------------------------------------------------------------

export function getCruisingStatus() {
  return apiFetch<CruisingStatus>('/cruising/me', { auth: 'required' });
}

export function onboardCruising(input: {
  birthDate: string;
  acceptTerms: true;
  consentSpecialData: true;
  termsVersion: string;
}) {
  return apiFetch<CruisingStatus>('/cruising/me', { method: 'PUT', body: input, auth: 'required' });
}

/** My Cruising settings (PATCH /cruising/profile): email alerts now, the profile in phase 2. */
export function updateCruisingProfile(input: { emailAlerts?: boolean }) {
  return apiFetch<CruisingStatus>('/cruising/profile', {
    method: 'PATCH',
    body: input,
    auth: 'required',
  });
}

export async function listMyCruisingSpots(): Promise<MyCruisingSpot[]> {
  return (await apiFetch<{ items: MyCruisingSpot[] }>('/cruising/me/spots', { auth: 'required' }))
    .items;
}

export function createCruisingSpot(input: SpotInput) {
  return apiFetch<{ id: string; slug: string; status: 'PENDING' }>('/cruising/spots', {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

export function updateCruisingSpot(id: string, input: Partial<SpotInput>) {
  return apiFetch<{ id: string; slug: string; status: CruisingSpotStatus }>(
    `/cruising/spots/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: input, auth: 'required' },
  );
}

export function deleteCruisingSpot(id: string) {
  return apiFetch<void>(`/cruising/spots/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

/** Reviews of a LIVE spot; only for a member who has entered. */
export function listCruisingReviews(spotId: string, page = 1, pageSize = 20) {
  return apiFetch<Paginated<CruisingReview>>(
    `/cruising/spots/${encodeURIComponent(spotId)}/reviews`,
    { auth: 'required', query: { page, pageSize } },
  );
}

export function saveCruisingReview(spotId: string, input: { rating: number; text?: string }) {
  return apiFetch<CruisingReview>(`/cruising/spots/${encodeURIComponent(spotId)}/review`, {
    method: 'PUT',
    body: input,
    auth: 'required',
  });
}

export function deleteCruisingReview(spotId: string) {
  return apiFetch<void>(`/cruising/spots/${encodeURIComponent(spotId)}/review`, {
    method: 'DELETE',
    auth: 'required',
  });
}

/** Exactly one target: a spot or a review. */
export function reportCruising(input: {
  spotId?: string;
  reviewId?: string;
  reason: CruisingReportReason;
  details?: string;
}) {
  return apiFetch<void>('/cruising/reports', { method: 'POST', body: input, auth: 'required' });
}

// ---- Admin -------------------------------------------------------------------------------------

type Person = { id: string; name: string; email: string };

export type AdminCruisingOverview = {
  members: number;
  pendingSpots: number;
  liveSpots: number;
  openReports: number;
  openTakedowns: number;
  reviews: number;
  suspended: number;
};

export type AdminCruisingSpot = {
  id: string;
  slug: string;
  name: string;
  type: CruisingSpotType;
  status: CruisingSpotStatus;
  lat: number;
  lng: number;
  countryCode: string;
  city: string;
  description: string;
  bestTimes: string | null;
  rejectReason: string | null;
  ratingAvg: number;
  ratingCount: number;
  createdBy: { userId: string; name: string; email: string } | null;
  openReports: number;
  createdAt: string;
};

/**
 * A report as the team sees it. The API gives `target` (the spot, the review with its spot, or the
 * saved transcript) and the people with their report counts; whatever is missing is left out.
 */
export type AdminCruisingReport = {
  id: string;
  targetType: 'SPOT' | 'REVIEW' | 'PROFILE' | 'CONVERSATION';
  reason: CruisingReportReason;
  details: string | null;
  status: 'OPEN' | 'DISMISSED' | 'ACTIONED';
  createdAt: string;
  target?: unknown;
  reporter?: (Partial<Person> & { userId?: string; reports?: number }) | null;
  reported?: (Partial<Person> & { userId?: string; reports?: number }) | null;
};

export type AdminCruisingTakedown = {
  id: string;
  email: string;
  spotLink: string | null;
  reason: string;
  details: string;
  locale: 'es' | 'en';
  status: 'OPEN' | 'REMOVED' | 'CLOSED';
  response: string | null;
  createdAt: string;
  spot?: { id: string; slug: string; name: string; status: CruisingSpotStatus } | null;
};

export type AdminCruisingSuspension = {
  userId: string;
  name: string;
  email: string;
  nickname: string | null;
  reason: string | null;
  /** null: for good. */
  until: string | null;
  suspendedAt: string | null;
};

export function getAdminCruisingOverview() {
  return apiFetch<AdminCruisingOverview>('/admin/cruising/overview', { auth: 'required' });
}

export async function listAdminCruisingSpots(
  status: CruisingSpotStatus,
  q?: string,
): Promise<AdminCruisingSpot[]> {
  return (
    await apiFetch<{ items: AdminCruisingSpot[] }>('/admin/cruising/spots', {
      auth: 'required',
      query: { status, q },
    })
  ).items;
}

export function patchAdminCruisingSpot(id: string, input: Partial<SpotInput>) {
  return apiFetch<void>(`/admin/cruising/spots/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    auth: 'required',
  });
}

export function approveCruisingSpot(id: string) {
  return apiFetch<void>(`/admin/cruising/spots/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    auth: 'required',
  });
}

export function hideCruisingSpot(id: string) {
  return apiFetch<void>(`/admin/cruising/spots/${encodeURIComponent(id)}/hide`, {
    method: 'POST',
    auth: 'required',
  });
}

export function rejectCruisingSpot(id: string, reason: string) {
  return apiFetch<void>(`/admin/cruising/spots/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: { reason },
    auth: 'required',
  });
}

export async function listAdminCruisingReports(
  status: AdminCruisingReport['status'],
): Promise<AdminCruisingReport[]> {
  return (
    await apiFetch<{ items: AdminCruisingReport[] }>('/admin/cruising/reports', {
      auth: 'required',
      query: { status },
    })
  ).items;
}

export function dismissCruisingReport(id: string) {
  return apiFetch<void>(`/admin/cruising/reports/${encodeURIComponent(id)}/dismiss`, {
    method: 'POST',
    auth: 'required',
  });
}

export function actOnCruisingReport(
  id: string,
  input: { remove: boolean; suspend: CruisingSuspension | null; reason?: string },
) {
  return apiFetch<void>(`/admin/cruising/reports/${encodeURIComponent(id)}/action`, {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

export async function listAdminCruisingTakedowns(
  status: AdminCruisingTakedown['status'],
): Promise<AdminCruisingTakedown[]> {
  return (
    await apiFetch<{ items: AdminCruisingTakedown[] }>('/admin/cruising/takedowns', {
      auth: 'required',
      query: { status },
    })
  ).items;
}

export function decideCruisingTakedown(id: string, remove: boolean, response: string) {
  return apiFetch<void>(`/admin/cruising/takedowns/${encodeURIComponent(id)}`, {
    method: 'POST',
    body: { remove, response },
    auth: 'required',
  });
}

export async function listAdminCruisingSuspensions(): Promise<AdminCruisingSuspension[]> {
  const result = await apiFetch<AdminCruisingSuspension[] | { items: AdminCruisingSuspension[] }>(
    '/admin/cruising/suspensions',
    { auth: 'required' },
  );
  return Array.isArray(result) ? result : result.items;
}

export function liftCruisingSuspension(userId: string) {
  return apiFetch<void>(`/admin/cruising/users/${encodeURIComponent(userId)}/suspension`, {
    method: 'DELETE',
    auth: 'required',
  });
}
