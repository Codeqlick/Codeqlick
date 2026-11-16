import 'server-only';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/constants';
import { clientHeaders } from '@/lib/auth/refresh';
import { env } from '@/lib/env';
import {
  forwardableRange,
  mediaResponseHeaders,
  proxiedStatus,
  type MediaKind,
  type MediaLimits,
  type MediaStatus,
  type MyMedia,
  type VerificationStatus,
} from '@/lib/cruising-media';
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
import type { MemberHealth as MemberHealthView } from '@/lib/cruising-safety';
import { apiFetch } from './client';
import { isApiError } from './errors';
import type { Paginated } from './types';

/** Cruising (architecture 4.15). Shapes mirror section 5's "Shapes" and the API's cruising module. */

/** A member as named in a list or a chat: the badge and the cover photo (phase 4, decision 87). */
export type CruisingMemberRef = { nickname: string; verified: boolean; coverId: string | null };

export type CruisingVerification = { status: VerificationStatus; note: string | null };

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
  author: CruisingMemberRef | null;
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
  /** Phase 4: the team approved my verification photo. */
  verified: boolean;
  verification: CruisingVerification;
  /** Phase 3 (decision 85): push alerts for favourites (default on). */
  favoriteAlerts: boolean;
  /** Phase 3: the daily email about favourites, without push (default off). */
  favoriteEmails: boolean;
  /** The VAPID key browsers subscribe with; null while notifications are off. */
  pushPublicKey: string | null;
  /** Phase 2; null until a nickname is set. */
  profile: {
    nickname: string;
    bio: string;
    country: string | null;
    lookingFor: CruisingLookingFor[];
    showAge: boolean;
    verified: boolean;
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
  mediaRef?: string;
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
  /** Phase 3: push alerts for favourites and the daily email about them. */
  favoriteAlerts?: boolean;
  favoriteEmails?: boolean;
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

/** Exactly one target: a spot, a review, a profile (`nickname`), a conversation or a photo/video. */
export function reportCruising(input: {
  spotId?: string;
  mediaId?: string;
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
  verified: boolean;
  coverId: string | null;
  /** Phase 5 (decision 94): only when the member shows it. */
  health?: MemberHealthView | null;
};

export type CruisingCheckIn = {
  spot: { id: string; slug: string; name: string };
  anonymous: boolean;
  expiresAt: string;
};

export type CruisingPresence = {
  /** Includes anonymous check-ins and mine. */
  count: number;
  members: { nickname: string; since: string; verified: boolean; coverId: string | null }[];
};

export type CruisingConversation = {
  id: string;
  partner: CruisingMemberRef;
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

// ---- Favourites and notifications (phase 3, decision 85) ---------------------------------------

export type CruisingFavorite = { spot: CruisingSpotSummary; here: number; savedAt: string };

/** My favourites whose spot is LIVE, newest first, with "N here now". */
export async function listCruisingFavorites(): Promise<CruisingFavorite[]> {
  return (
    await apiFetch<{ items: CruisingFavorite[] }>('/cruising/favorites', { auth: 'required' })
  ).items;
}

/** Saves a LIVE spot (`409` past 100) or removes it; both idempotent. */
export function setCruisingFavorite(spotId: string, on: boolean) {
  return apiFetch<void>(`/cruising/favorites/${encodeURIComponent(spotId)}`, {
    method: on ? 'PUT' : 'DELETE',
    auth: 'required',
  });
}

/** This device's push subscription (`409` while notifications are off). */
export function subscribeCruisingPush(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  return apiFetch<void>('/cruising/push', { method: 'PUT', body: input, auth: 'required' });
}

export function unsubscribeCruisingPush(endpoint: string) {
  return apiFetch<void>('/cruising/push', {
    method: 'DELETE',
    body: { endpoint },
    auth: 'required',
  });
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
  /** Phase 4. */
  newMedia?: number;
  liveMedia?: number;
  pendingVerifications?: number;
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
  targetType: 'SPOT' | 'REVIEW' | 'PROFILE' | 'CONVERSATION' | 'MEDIA';
  reason: CruisingReportReason;
  details: string | null;
  status: 'OPEN' | 'DISMISSED' | 'ACTIONED';
  createdAt: string;
  target?: unknown;
  /** A conversation report's saved chat, when the API gives it beside `target`. */
  transcript?: unknown;
  reporter?: (Partial<Person> & { userId?: string; reports?: number }) | null;
  reported?: (Partial<Person> & { userId?: string; reports?: number; verified?: boolean }) | null;
};

/** A photo or video as a report or a removal request names it. */
export type MediaTarget = { id: string; ref: string; kind: MediaKind; status: MediaStatus };

export type AdminCruisingTakedown = {
  id: string;
  email: string;
  spotLink: string | null;
  mediaRef?: string | null;
  media?: MediaTarget | null;
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
  verified?: boolean;
};

export type AdminMediaOwner = {
  userId: string;
  name: string;
  email: string;
  nickname: string | null;
  verified: boolean;
  suspended: boolean;
};

export type AdminMedia = MediaTarget & {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  failure: string | null;
  reviewedAt: string | null;
  createdAt: string;
  openReports: number;
  owner: AdminMediaOwner;
};

export type AdminVerification = {
  userId: string;
  nickname: string | null;
  name: string;
  email: string;
  memberSince: string;
  sentAt: string;
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
  input: {
    remove: boolean;
    suspend: CruisingSuspension | null;
    reason?: string;
    withdrawVerification?: boolean;
  },
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

// ---- Phase 4: verification and media -------------------------------------------------------------

/** My verification photo (a JPEG/PNG/WebP of me with a paper showing my nickname and the date). */
export function uploadCruisingVerification(file: File) {
  const form = new FormData();
  form.set('file', file, file.name || 'verification.jpg');
  return apiFetch<{ status: 'PENDING' }>('/cruising/verification', {
    method: 'POST',
    body: form,
    auth: 'required',
    signal: AbortSignal.timeout(30_000),
  });
}

export type MyMediaList = {
  items: MyMedia[];
  verification: CruisingVerification;
  limits: MediaLimits;
};

export function getMyCruisingMedia() {
  return apiFetch<MyMediaList>('/cruising/media', { auth: 'required' });
}

/** A photo (shrunk in the browser); videos go through the upload route handler instead. */
export function uploadCruisingPhoto(file: File) {
  const form = new FormData();
  form.set('file', file, file.name || 'photo.jpg');
  form.set('consent', 'true');
  return apiFetch<MyMedia>('/cruising/media', {
    method: 'POST',
    body: form,
    auth: 'required',
    signal: AbortSignal.timeout(30_000),
  });
}

export function updateCruisingMedia(id: string, input: { cover?: true; position?: number }) {
  return apiFetch<void>(`/cruising/media/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: input,
    auth: 'required',
  });
}

export function deleteCruisingMedia(id: string) {
  return apiFetch<void>(`/cruising/media/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

export type CruisingMemberMedia = {
  id: string;
  ref: string;
  kind: MediaKind;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  cover: boolean;
};

/** The LIVE photos and videos of a member, or [] when the profile isn't there (404). */
export async function listCruisingMemberMedia(nickname: string): Promise<CruisingMemberMedia[]> {
  try {
    return (
      await apiFetch<{ items: CruisingMemberMedia[] }>(
        `/cruising/members/${encodeURIComponent(nickname)}/media`,
        { auth: 'required' },
      )
    ).items;
  } catch (error) {
    if (isApiError(error) && error.status === 404) return [];
    throw error;
  }
}

/**
 * A file from the API (a photo, a video, a poster, a verification photo) for the browser, as the
 * signed-in person. It is streamed, never buffered, and the browser's `Range` goes along so a
 * video can seek (206). The browser never calls the API itself (BFF).
 */
export async function fetchCruisingFile(path: string, request: Request): Promise<Response> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return new Response(null, { status: 401 });
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const range = forwardableRange(request.headers.get('range'));
  if (range) headers.Range = range;
  // The wait is for the API's answer; the body then streams for as long as the person watches.
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort);
  const timer = setTimeout(abort, 15_000);
  let upstream: Response;
  try {
    upstream = await fetch(`${env.API_URL}${path}`, {
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch {
    return new Response(null, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
  const status = proxiedStatus(upstream.status);
  if (status !== upstream.status || !upstream.body) {
    await upstream.body?.cancel().catch(() => undefined);
    return new Response(null, { status, headers: { 'Cache-Control': 'private, no-store' } });
  }
  return new Response(upstream.body, { status, headers: mediaResponseHeaders(upstream.headers) });
}

/**
 * Streams a video upload to the API: the browser's multipart body goes through as it arrives
 * (`duplex: 'half'`), never held in memory. The `Content-Type` carries the multipart boundary.
 */
export async function streamCruisingUpload(request: Request): Promise<Response> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 });
  const headers: Record<string, string> = {
    ...clientHeaders(request.headers),
    Authorization: `Bearer ${token}`,
    'Content-Type': request.headers.get('content-type') ?? 'multipart/form-data',
  };
  const length = request.headers.get('content-length');
  if (length) headers['Content-Length'] = length;
  let upstream: Response;
  try {
    upstream = await fetch(`${env.API_URL}/cruising/media`, {
      method: 'POST',
      headers,
      body: request.body,
      // Node's fetch needs this to send a stream.
      duplex: 'half',
      cache: 'no-store',
      // 100 MB on a slow connection, plus the video's processing on the API's side.
      signal: AbortSignal.timeout(10 * 60_000),
    } as RequestInit & { duplex: 'half' });
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 502 });
  }
  const body = await upstream.text();
  return new Response(body || null, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

// ---- Phase 4: admin ------------------------------------------------------------------------------

export async function listAdminCruisingMedia(
  queue: 'new' | 'hidden' | 'all',
): Promise<AdminMedia[]> {
  return (
    await apiFetch<{ items: AdminMedia[] }>('/admin/cruising/media', {
      auth: 'required',
      query: { queue },
    })
  ).items;
}

export function markCruisingMediaReviewed(id: string) {
  return apiFetch<void>(`/admin/cruising/media/${encodeURIComponent(id)}/reviewed`, {
    method: 'POST',
    auth: 'required',
  });
}

export function removeCruisingMedia(
  id: string,
  input: {
    reason: string;
    blockHash: boolean;
    suspend: CruisingSuspension | null;
    withdrawVerification: boolean;
  },
) {
  return apiFetch<void>(`/admin/cruising/media/${encodeURIComponent(id)}/remove`, {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

export async function listAdminCruisingVerifications(): Promise<AdminVerification[]> {
  return (
    await apiFetch<{ items: AdminVerification[] }>('/admin/cruising/verifications', {
      auth: 'required',
    })
  ).items;
}

export function decideCruisingVerification(userId: string, approve: boolean, note?: string) {
  return apiFetch<void>(`/admin/cruising/verifications/${encodeURIComponent(userId)}`, {
    method: 'POST',
    body: { approve, note },
    auth: 'required',
  });
}

/** Withdraws a member's badge (they are emailed). */
export function withdrawCruisingVerification(userId: string) {
  return apiFetch<void>(`/admin/cruising/users/${encodeURIComponent(userId)}/verification`, {
    method: 'DELETE',
    auth: 'required',
  });
}
