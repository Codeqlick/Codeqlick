import 'server-only';
import {
  formatBbox,
  type Bbox,
  type CruisingLookingFor,
  type CruisingMessage,
  type CruisingReportReason,
  type CruisingSpotStatus,
  type CruisingSpotType,
  type CruisingSuspension,
  type CruisingTakedownReason,
  type SpotImportFormat,
  type SpotImportResult,
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
    lookingFor: CruisingLookingFor[];
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

/**
 * The LIVE spots in a box (up to 500), of a type and rated at least `minRating` when given. The
 * visitor's address is forwarded for the API's limit.
 */
export function listCruisingSpots(
  box: Bbox,
  type?: CruisingSpotType | null,
  minRating?: number | null,
) {
  return apiFetch<{ items: CruisingSpotSummary[]; truncated: boolean }>('/cruising/spots', {
    query: { bbox: formatBbox(box), type, minRating },
    forwardClientIp: true,
  });
}

/** A city a search found; the map fits itself to `bbox` (`[minLng, minLat, maxLng, maxLat]`). */
export type CruisingPlaceMatch = {
  countryCode: string;
  city: string;
  citySlug: string;
  count: number;
  bbox: [number, number, number, number];
};

export type CruisingSearch = { places: CruisingPlaceMatch[]; spots: CruisingSpotSummary[] };

/** Cities and spots by text (2-60 characters), up to 8 of each. Public; the address is forwarded. */
export function searchCruising(text: string) {
  return apiFetch<CruisingSearch>('/cruising/search', {
    query: { q: text },
    forwardClientIp: true,
  });
}

/** The spots of a grid box with someone there now; only for a member who has entered. */
export async function listCruisingActive(box: Bbox): Promise<{ spotId: string; here: number }[]> {
  return (
    await apiFetch<{ items: { spotId: string; here: number }[] }>('/cruising/active', {
      query: { bbox: formatBbox(box) },
      auth: 'required',
    })
  ).items;
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
export function updateCruisingProfile(input: {
  emailAlerts?: boolean;
  /** Phase 2. Once set it can't be removed; `409` when taken, `400` when not allowed. */
  nickname?: string;
  bio?: string;
  country?: string | null;
  lookingFor?: CruisingLookingFor[];
  showAge?: boolean;
}) {
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

/** Exactly one target: a spot, a review, a profile (`nickname`) or a conversation. */
export function reportCruising(input: {
  spotId?: string;
  reviewId?: string;
  nickname?: string;
  conversationId?: string;
  reason: CruisingReportReason;
  details?: string;
}) {
  return apiFetch<void>('/cruising/reports', { method: 'POST', body: input, auth: 'required' });
}

// ---- Phase 2: members, check-ins, messages and blocks ------------------------------------------

export type CruisingMember = {
  nickname: string;
  bio: string;
  country: string | null;
  lookingFor: CruisingLookingFor[];
  /** null unless the member shows it. */
  age: number | null;
  memberSince: string;
};

export type CruisingCheckIn = {
  spot: { id: string; slug: string; name: string };
  anonymous: boolean;
  expiresAt: string;
};

export type CruisingPresence = {
  /** Includes anonymous check-ins and mine. */
  count: number;
  members: { nickname: string; since: string }[];
};

export type CruisingConversation = {
  id: string;
  partner: { nickname: string };
  lastMessage: { text: string; mine: boolean; at: string } | null;
  /** A flag or a count of unread messages. */
  unread: boolean | number;
  createdAt: string;
};

export type { CruisingMessage };

/** A member's profile, or null when unknown, blocked either way or suspended (404). */
export async function getCruisingMember(nickname: string): Promise<CruisingMember | null> {
  try {
    return await apiFetch<CruisingMember>(`/cruising/members/${encodeURIComponent(nickname)}`, {
      auth: 'required',
    });
  } catch (error) {
    if (isApiError(error) && error.status === 404) return null;
    throw error;
  }
}

/** My active check-in, or null. */
export async function getMyCruisingCheckIn(): Promise<CruisingCheckIn | null> {
  return (
    (await apiFetch<CruisingCheckIn | null>('/cruising/check-in', { auth: 'required' })) ?? null
  );
}

export function createCruisingCheckIn(input: {
  spotId: string;
  hours: 1 | 2 | 3;
  anonymous: boolean;
}) {
  return apiFetch<CruisingCheckIn>('/cruising/check-ins', {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

export function endCruisingCheckIn() {
  return apiFetch<void>('/cruising/check-in', { method: 'DELETE', auth: 'required' });
}

/** Who is at a spot now; only for a member who has entered. */
export function getCruisingPresence(spotId: string) {
  return apiFetch<CruisingPresence>(`/cruising/spots/${encodeURIComponent(spotId)}/presence`, {
    auth: 'required',
  });
}

export async function listCruisingConversations(): Promise<CruisingConversation[]> {
  return (
    await apiFetch<{ items: CruisingConversation[] }>('/cruising/conversations', {
      auth: 'required',
    })
  ).items;
}

/** Opens the conversation with a member, or returns the existing one. */
export function openCruisingConversation(nickname: string) {
  return apiFetch<{ id: string }>('/cruising/conversations', {
    method: 'POST',
    body: { nickname },
    auth: 'required',
  });
}

/** The last 100 messages, or those after `after` (an ISO time); marks them read. */
export async function listCruisingMessages(
  conversationId: string,
  after?: string,
): Promise<CruisingMessage[]> {
  return (
    await apiFetch<{ items: CruisingMessage[] }>(
      `/cruising/conversations/${encodeURIComponent(conversationId)}/messages`,
      { auth: 'required', query: { after } },
    )
  ).items;
}

export function sendCruisingMessage(conversationId: string, text: string) {
  return apiFetch<CruisingMessage>(
    `/cruising/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: 'POST', body: { text }, auth: 'required' },
  );
}

/** Deletes the conversation for both. */
export function leaveCruisingConversation(conversationId: string) {
  return apiFetch<void>(`/cruising/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

/** Deletes the conversation and blocks the person both ways. */
export function blockCruisingConversation(conversationId: string) {
  return apiFetch<void>(`/cruising/conversations/${encodeURIComponent(conversationId)}/block`, {
    method: 'POST',
    auth: 'required',
  });
}

export async function listCruisingBlocks(): Promise<{ nickname: string; createdAt: string }[]> {
  return (
    await apiFetch<{ items: { nickname: string; createdAt: string }[] }>('/cruising/blocks', {
      auth: 'required',
    })
  ).items;
}

export function blockCruisingMember(nickname: string) {
  return apiFetch<void>('/cruising/blocks', {
    method: 'POST',
    body: { nickname },
    auth: 'required',
  });
}

export function unblockCruisingMember(nickname: string) {
  return apiFetch<void>(`/cruising/blocks/${encodeURIComponent(nickname)}`, {
    method: 'DELETE',
    auth: 'required',
  });
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
  /** Phase 2. */
  activeCheckIns?: number;
  conversations?: number;
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
  /** A conversation report's saved chat, when the API gives it beside `target`. */
  transcript?: unknown;
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

/** A team spot (decision 84): LIVE at once, or PENDING with `publish: false`. */
export function createAdminCruisingSpot(input: SpotInput & { publish: boolean }) {
  return apiFetch<{ id: string; slug: string; status: 'LIVE' | 'PENDING' }>(
    '/admin/cruising/spots',
    { method: 'POST', body: input, auth: 'required' },
  );
}

/** Imports a CSV or GeoJSON file of spots (decision 84), or answers what it would do (`dryRun`). */
export function importAdminCruisingSpots(input: {
  format: SpotImportFormat;
  content: string;
  publish: boolean;
  dryRun: boolean;
}) {
  return apiFetch<SpotImportResult>('/admin/cruising/spots/import', {
    method: 'POST',
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

export function decideCruisingTakedown(id: string, remove: boolean, response?: string) {
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
