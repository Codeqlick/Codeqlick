import 'server-only';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@/lib/auth/constants';
import { env } from '@/lib/env';
import type { Interest } from '../videochat-interests';
import { apiFetch } from './client';

/** Swipe (architecture 4.10). Shapes mirror the API's swipe module. */

export const SWIPE_GENDERS = ['WOMAN', 'MAN', 'NONBINARY'] as const;
export type SwipeGender = (typeof SWIPE_GENDERS)[number];

export const SWIPE_REPORT_REASONS = [
  'MINOR',
  'NON_CONSENSUAL',
  'STOLEN',
  'ILLEGAL',
  'HARASSMENT',
  'SPAM',
  'OTHER',
] as const;
export type SwipeReportReason = (typeof SWIPE_REPORT_REASONS)[number];
export const TAKEDOWN_REASONS = ['MINOR', 'NON_CONSENSUAL', 'STOLEN', 'ILLEGAL', 'OTHER'] as const;
export type TakedownReason = (typeof TAKEDOWN_REASONS)[number];

export const SWIPE_SUSPENSIONS = ['24h', '7d', '30d', 'permanent'] as const;
export type SwipeSuspension = (typeof SWIPE_SUSPENSIONS)[number];

export type PhotoStatus = 'PENDING' | 'LIVE' | 'REJECTED' | 'HIDDEN';
export type VerificationStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';

/** Countries a profile can name (the API's COUNTRIES). */
export const SWIPE_COUNTRIES = [
  'ES',
  'MX',
  'AR',
  'CO',
  'CL',
  'PE',
  'VE',
  'EC',
  'GT',
  'CU',
  'BO',
  'DO',
  'HN',
  'PY',
  'SV',
  'NI',
  'CR',
  'PA',
  'UY',
  'PR',
  'US',
  'CA',
  'GB',
  'IE',
  'FR',
  'PT',
  'IT',
  'DE',
  'NL',
  'BE',
  'CH',
  'AT',
  'SE',
  'NO',
  'DK',
  'FI',
  'PL',
  'RO',
  'GR',
  'AD',
  'AU',
] as const;
export type SwipeCountry = (typeof SWIPE_COUNTRIES)[number];
export const MIN_AGE_FILTER = 18;
export const MAX_AGE_FILTER = 99;

export type SwipeProfile = {
  nickname: string | null;
  gender: SwipeGender | null;
  seeking: SwipeGender[];
  interests: Interest[];
  bio: string | null;
  birthYear: number | null;
  country: SwipeCountry | null;
  ageMin: number;
  ageMax: number;
  sameCountry: boolean;
  emailAlerts: boolean;
  blurPhotos: boolean;
};

export type SwipeProfileInput = {
  nickname: string;
  gender: SwipeGender | null;
  seeking: SwipeGender[];
  interests: Interest[];
  bio: string | null;
  birthYear: number | null;
  country: SwipeCountry | null;
  ageMin: number;
  ageMax: number;
  sameCountry: boolean;
  emailAlerts: boolean;
  blurPhotos: boolean;
};

export type SwipeStatus = {
  onboarded: boolean;
  termsVersion: string;
  acceptedTermsVersion: string | null;
  suspended: boolean;
  suspension: { reason: string | null; until: string | null } | null;
  allowed: boolean;
  profile: SwipeProfile | null;
  verification: { status: VerificationStatus; note: string | null; hasPhoto: boolean };
  canUpload: boolean;
  superLikesLeft: number;
};

export type MyPhoto = {
  id: string;
  ref: string;
  status: PhotoStatus;
  rejectReason: string | null;
  likes: number;
  width: number;
  height: number;
  /** In the private album: only matches see it. */
  inAlbum: boolean;
  createdAt: string;
};

/** Photos a person can keep in their private album, on top of the 10 public ones. */
export const MAX_ALBUM_PHOTOS = 5;

/** A photo of a match's private album. */
export type SwipeAlbumPhoto = { id: string; ref: string; width: number; height: number };

export type SwipeCard = {
  id: string;
  ref: string;
  width: number;
  height: number;
  nickname: string;
  gender: SwipeGender | null;
  interests: Interest[];
  bio: string | null;
  /** Their verification photo was approved by the team. */
  verified: boolean;
  /** They gave one of my photos a "love". */
  lovesYou: boolean;
};

export type SwipeWeek = { views: number; likes: number; loves: number; matches: number };
export type SwipeStats = { week: SwipeWeek; previousWeek: SwipeWeek };

export type SwipeMatch = {
  id: string;
  partner: {
    nickname: string;
    gender: SwipeGender | null;
    interests: Interest[];
    bio: string | null;
    verified: boolean;
    photoId: string | null;
    /** Live photos in their private album. */
    albumPhotos: number;
  };
  lastMessage: { text: string; mine: boolean; at: string } | null;
  unread: number;
  createdAt: string;
};

export type SwipeMessage = { id: string; mine: boolean; text: string; createdAt: string };

type Person = { id: string; name: string; email: string };

export type AdminSwipeOverview = {
  members: number;
  uploaders: number;
  pendingVerifications: number;
  pendingPhotos: number;
  livePhotos: number;
  openReports: number;
  openTakedowns: number;
  matches: number;
  suspended: number;
};

export type AdminVerification = {
  userId: string;
  nickname: string | null;
  name: string;
  email: string;
  memberSince: string;
  sentAt: string | null;
};

export type AdminPhoto = {
  id: string;
  ref: string;
  status: PhotoStatus;
  rejectReason: string | null;
  likes: number;
  width: number;
  height: number;
  inAlbum: boolean;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string } | null;
  owner: Person & {
    memberSince: string;
    nickname: string | null;
    verifiedAt: string | null;
    hasVerificationPhoto: boolean;
    reports: number;
  };
};

export type AdminReport = {
  id: string;
  reason: SwipeReportReason;
  details: string | null;
  transcript: Array<{ from: 'reporter' | 'reported'; text: string; at: string }>;
  status: 'OPEN' | 'DISMISSED' | 'ACTIONED';
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string } | null;
  photo: { id: string; ref: string; status: PhotoStatus } | null;
  reporter: Person & { nickname: string | null };
  reported: Person & { nickname: string | null; suspended: boolean; reports: number };
};

export type AdminTakedown = {
  id: string;
  email: string;
  photoRef: string | null;
  reason: SwipeReportReason;
  details: string;
  locale: 'es' | 'en';
  status: 'OPEN' | 'REMOVED' | 'CLOSED';
  response: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string } | null;
  photo: {
    id: string;
    ref: string;
    status: PhotoStatus;
    owner: Person & { nickname: string | null };
  } | null;
};

export type AdminSuspension = {
  user: Person;
  nickname: string | null;
  suspendedAt: string | null;
  until: string | null;
  reason: string | null;
};

// ---- Members ---------------------------------------------------------------------------------------

export function getSwipeStatus() {
  return apiFetch<SwipeStatus>('/swipe/me', { auth: 'required' });
}

export function onboardSwipe(input: {
  birthDate: string;
  acceptTerms: true;
  termsVersion: string;
}) {
  return apiFetch<SwipeStatus>('/swipe/me', { method: 'PUT', body: input, auth: 'required' });
}

export function saveSwipeProfile(input: SwipeProfileInput) {
  return apiFetch<SwipeStatus>('/swipe/profile', { method: 'PUT', body: input, auth: 'required' });
}

function imageForm(file: File, album = false): FormData {
  const form = new FormData();
  form.set('file', file, 'photo.jpg');
  form.set('consent', 'true');
  if (album) form.set('album', 'true');
  return form;
}

export function uploadSwipeVerification(file: File) {
  return apiFetch<SwipeStatus>('/swipe/verification', {
    method: 'POST',
    body: imageForm(file),
    auth: 'required',
    signal: AbortSignal.timeout(30_000),
  });
}

export function uploadSwipePhoto(file: File, album = false) {
  return apiFetch<MyPhoto>('/swipe/photos', {
    method: 'POST',
    body: imageForm(file, album),
    auth: 'required',
    signal: AbortSignal.timeout(30_000),
  });
}

export async function listMySwipePhotos(): Promise<MyPhoto[]> {
  return (await apiFetch<{ items: MyPhoto[] }>('/swipe/photos', { auth: 'required' })).items;
}

/** Moves one of my photos into or out of the private album. */
export function moveSwipePhoto(id: string, album: boolean) {
  return apiFetch<MyPhoto>(`/swipe/photos/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { album },
    auth: 'required',
  });
}

/** The private album of the person I matched with. */
export async function listSwipeAlbum(matchId: string): Promise<SwipeAlbumPhoto[]> {
  return (
    await apiFetch<{ items: SwipeAlbumPhoto[] }>(
      `/swipe/matches/${encodeURIComponent(matchId)}/album`,
      { auth: 'required' },
    )
  ).items;
}

export function deleteSwipePhoto(id: string) {
  return apiFetch<void>(`/swipe/photos/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

export async function getSwipeDeck(): Promise<SwipeCard[]> {
  return (await apiFetch<{ items: SwipeCard[] }>('/swipe/deck', { auth: 'required' })).items;
}

export function voteSwipe(photoId: string, like: boolean, superLike = false) {
  return apiFetch<{ match: { id: string; nickname: string } | null }>('/swipe/votes', {
    method: 'POST',
    body: { photoId, like, superLike },
    auth: 'required',
  });
}

/** Undoes my last vote (recent, without a match) and returns its card. */
export function undoSwipeVote() {
  return apiFetch<{ card: SwipeCard }>('/swipe/votes/undo', { method: 'POST', auth: 'required' });
}

export function getSwipePushKey() {
  return apiFetch<{ publicKey: string | null }>('/swipe/push', { auth: 'required' });
}

export function subscribeSwipePush(input: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  locale: string;
}) {
  return apiFetch<void>('/swipe/push', { method: 'PUT', body: input, auth: 'required' });
}

export function unsubscribeSwipePush(endpoint: string) {
  return apiFetch<void>('/swipe/push', {
    method: 'DELETE',
    body: { endpoint },
    auth: 'required',
  });
}

/** My figures: the last 7 days and the 7 before. */
export function getSwipeStats() {
  return apiFetch<SwipeStats>('/swipe/stats', { auth: 'required' });
}

export async function listSwipeMatches(): Promise<SwipeMatch[]> {
  return (await apiFetch<{ items: SwipeMatch[] }>('/swipe/matches', { auth: 'required' })).items;
}

export async function listSwipeMessages(matchId: string, after?: string): Promise<SwipeMessage[]> {
  const path = `/swipe/matches/${encodeURIComponent(matchId)}/messages`;
  return (await apiFetch<{ items: SwipeMessage[] }>(path, { auth: 'required', query: { after } }))
    .items;
}

export function sendSwipeMessage(matchId: string, text: string) {
  return apiFetch<SwipeMessage>(`/swipe/matches/${encodeURIComponent(matchId)}/messages`, {
    method: 'POST',
    body: { text },
    auth: 'required',
  });
}

export function unmatchSwipe(matchId: string) {
  return apiFetch<void>(`/swipe/matches/${encodeURIComponent(matchId)}`, {
    method: 'DELETE',
    auth: 'required',
  });
}

export function blockSwipeMatch(matchId: string) {
  return apiFetch<void>(`/swipe/matches/${encodeURIComponent(matchId)}/block`, {
    method: 'POST',
    auth: 'required',
  });
}

export function reportSwipe(input: {
  photoId?: string;
  matchId?: string;
  reason: SwipeReportReason;
  details?: string;
}) {
  return apiFetch<void>('/swipe/reports', { method: 'POST', body: input, auth: 'required' });
}

export function requestSwipeTakedown(input: {
  email: string;
  photoRef?: string;
  reason: TakedownReason;
  details: string;
  locale: 'es' | 'en';
  website?: string;
}) {
  return apiFetch<{ id: string }>('/swipe/takedown', {
    method: 'POST',
    body: input,
    forwardClientIp: true,
  });
}

/**
 * An image from the API (a photo, or a verification photo), as the signed-in person: the route
 * handlers pass it to the browser, which never calls the API itself (BFF).
 */
export async function fetchSwipeImage(path: string): Promise<Response> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return new Response(null, { status: 401 });
  const response = await fetch(`${env.API_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok || !response.body) return new Response(null, { status: response.status });
  return new Response(response.body, {
    status: 200,
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': path.includes('verification') ? 'private, no-store' : 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}

// ---- Admin -----------------------------------------------------------------------------------------

export function getAdminSwipeOverview() {
  return apiFetch<AdminSwipeOverview>('/admin/swipe/overview', { auth: 'required' });
}

export async function listAdminSwipeVerifications(): Promise<AdminVerification[]> {
  return (
    await apiFetch<{ items: AdminVerification[] }>('/admin/swipe/verifications', {
      auth: 'required',
    })
  ).items;
}

export function decideSwipeVerification(userId: string, approve: boolean, note?: string) {
  return apiFetch<void>(`/admin/swipe/verifications/${encodeURIComponent(userId)}`, {
    method: 'POST',
    body: { approve, note },
    auth: 'required',
  });
}

export async function listAdminSwipePhotos(status: PhotoStatus): Promise<AdminPhoto[]> {
  return (
    await apiFetch<{ items: AdminPhoto[] }>('/admin/swipe/photos', {
      auth: 'required',
      query: { status },
    })
  ).items;
}

export function approveSwipePhoto(id: string) {
  return apiFetch<void>(`/admin/swipe/photos/${encodeURIComponent(id)}/approve`, {
    method: 'POST',
    auth: 'required',
  });
}

export function rejectSwipePhoto(id: string, reason: string, block: boolean) {
  return apiFetch<void>(`/admin/swipe/photos/${encodeURIComponent(id)}/reject`, {
    method: 'POST',
    body: { reason, block },
    auth: 'required',
  });
}

export function hideSwipePhoto(id: string) {
  return apiFetch<void>(`/admin/swipe/photos/${encodeURIComponent(id)}/hide`, {
    method: 'POST',
    auth: 'required',
  });
}

export async function listAdminSwipeReports(status: AdminReport['status']): Promise<AdminReport[]> {
  return (
    await apiFetch<{ items: AdminReport[] }>('/admin/swipe/reports', {
      auth: 'required',
      query: { status },
    })
  ).items;
}

export function dismissSwipeReport(id: string) {
  return apiFetch<void>(`/admin/swipe/reports/${encodeURIComponent(id)}/dismiss`, {
    method: 'POST',
    auth: 'required',
  });
}

export function actOnSwipeReport(
  id: string,
  input: { removePhoto: boolean; blockImage: boolean; suspend: SwipeSuspension | null },
) {
  return apiFetch<void>(`/admin/swipe/reports/${encodeURIComponent(id)}/action`, {
    method: 'POST',
    body: input,
    auth: 'required',
  });
}

export async function listAdminSwipeTakedowns(
  status: AdminTakedown['status'],
): Promise<AdminTakedown[]> {
  return (
    await apiFetch<{ items: AdminTakedown[] }>('/admin/swipe/takedowns', {
      auth: 'required',
      query: { status },
    })
  ).items;
}

export function decideSwipeTakedown(id: string, remove: boolean, response?: string) {
  return apiFetch<void>(`/admin/swipe/takedowns/${encodeURIComponent(id)}`, {
    method: 'POST',
    body: { remove, response },
    auth: 'required',
  });
}

export async function listAdminSwipeSuspensions(): Promise<AdminSuspension[]> {
  return (
    await apiFetch<{ items: AdminSuspension[] }>('/admin/swipe/suspensions', { auth: 'required' })
  ).items;
}

export function liftSwipeSuspension(userId: string) {
  return apiFetch<void>(`/admin/swipe/users/${encodeURIComponent(userId)}/suspension`, {
    method: 'DELETE',
    auth: 'required',
  });
}
