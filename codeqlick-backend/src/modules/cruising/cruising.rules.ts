/** Pure rules of Cruising (architecture 4.15): slugs, coordinates, the map's box, ratings, statuses. */
import { RESERVED_USERNAMES } from '../auth/auth.schemas.js';

/** Lower-case ASCII words joined by hyphens: "Playa del Inglés" becomes "playa-del-ingles". */
export function slugify(value: string, max = 60): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '');
}

/** The start of a spot's slug. */
export function spotSlugBase(name: string): string {
  return slugify(name) || 'spot';
}

/** The slug of a city, for the place pages. */
export function citySlugOf(city: string): string {
  return slugify(city, 80) || 'other';
}

/** `base`, then `base-2`, `base-3`… the first that `isTaken` says is free. */
export async function uniqueSlug(
  base: string,
  isTaken: (slug: string) => Promise<boolean>,
  maxTries = 50,
): Promise<string> {
  for (let n = 1; n <= maxTries; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  // Absurdly popular name: a random tail always ends it.
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Coordinates are stored with 5 decimals (about a metre). */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e5) / 1e5 + 0;
}

export interface Bbox {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/**
 * `minLng,minLat,maxLng,maxLat`: all numbers, longitudes within -180..180, latitudes within
 * -90..90, min below max. A box crossing the antimeridian is asked for as two; null when invalid.
 */
export function parseBbox(value: string): Bbox | null {
  const parts = value.split(',');
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => (part.trim() === '' ? Number.NaN : Number(part)));
  if (!numbers.every((number) => Number.isFinite(number))) return null;
  const [minLng, minLat, maxLng, maxLat] = numbers as [number, number, number, number];
  if (minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90) return null;
  if (minLng >= maxLng || minLat >= maxLat) return null;
  return { minLng, minLat, maxLng, maxLat };
}

/** What a search's text becomes in a `LIKE`: `%`, `_` and `\\` typed are literal characters. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * The `ILIKE` patterns of a search (decision 86): `contains` finds the text anywhere, `prefix` only
 * at the start (those come first). Spaces inside are collapsed to one.
 */
export function searchPatterns(text: string): { contains: string; prefix: string } {
  const words = escapeLike(text.trim().replace(/\s+/g, ' '));
  return { contains: `%${words}%`, prefix: `${words}%` };
}

/** The box around a city's spots, as the map takes it: `[minLng, minLat, maxLng, maxLat]`. */
export function placeBbox(row: {
  minLng: unknown;
  minLat: unknown;
  maxLng: unknown;
  maxLat: unknown;
}): [number, number, number, number] {
  return [Number(row.minLng), Number(row.minLat), Number(row.maxLng), Number(row.maxLat)];
}

/** The average rating with 2 decimals. */
export function roundRating(average: number | null | undefined): number {
  return average ? Math.round(average * 100) / 100 : 0;
}

/** Average (2 decimals) and count of a list of ratings. */
export function summarizeRatings(ratings: readonly number[]): { avg: number; count: number } {
  if (ratings.length === 0) return { avg: 0, count: 0 };
  const sum = ratings.reduce((total, rating) => total + rating, 0);
  return { avg: roundRating(sum / ratings.length), count: ratings.length };
}

export type SpotStatusValue = 'PENDING' | 'LIVE' | 'REJECTED' | 'HIDDEN' | 'REMOVED';
export type SpotAction = 'approve' | 'hide' | 'reject' | 'remove';

/**
 * Where the team can take a spot: publish (approve) any spot that is not live, hide a live one,
 * reject one in review or published (not a removed one), and remove any not removed yet (after a
 * report or a removal request: final for the proposer). Null: not allowed from there.
 */
export function nextSpotStatus(from: SpotStatusValue, action: SpotAction): SpotStatusValue | null {
  if (action === 'approve') return from === 'LIVE' ? null : 'LIVE';
  if (action === 'hide') return from === 'LIVE' ? 'HIDDEN' : null;
  if (action === 'remove') return from === 'REMOVED' ? null : 'REMOVED';
  return from === 'REJECTED' || from === 'REMOVED' ? null : 'REJECTED';
}

/** Reasons that hide a spot at once when they come from the anonymous removal form. */
export function takedownHidesAtOnce(reason: string): boolean {
  return reason === 'MINOR' || reason === 'ILLEGAL';
}

/** The proposer can change or delete a spot only while it is pending or rejected (never removed). */
export function memberCanChange(status: SpotStatusValue): boolean {
  return status === 'PENDING' || status === 'REJECTED';
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The slug in what a person gives: a link ending in `/spots/<slug>`, or the slug itself. */
export function extractSpotSlug(value: string): string | null {
  const text = value.trim().toLowerCase();
  if (!text) return null;
  if (SLUG.test(text)) return text;
  const path = text.replace(/[?#].*$/, '');
  const segments = path.split('/').filter(Boolean);
  const at = segments.lastIndexOf('spots');
  const slug = at >= 0 ? segments[at + 1] : undefined;
  return slug && SLUG.test(slug) ? slug : null;
}

/** Suspended right now: a timed suspension that ended no longer counts. */
export function isSuspended(
  profile: { suspendedAt: Date | null; suspendedUntil: Date | null } | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!profile?.suspendedAt) return false;
  return !profile.suspendedUntil || profile.suspendedUntil > now;
}

/** Words only Cruising reserves, besides the platform's reserved usernames. */
const RESERVED_NICKNAMES = new Set([
  'member',
  'members',
  'miembro',
  'miembros',
  'nickname',
  'apodo',
  'deleted',
  'eliminado',
  'unknown',
  'desconocido',
]);

/** Nicknames nobody can take: the team's, the platform's and the generic words of the app. */
export function isReservedNickname(nickname: string): boolean {
  const word = nickname.toLowerCase().replace(/[._]/g, '');
  return RESERVED_USERNAMES.has(word) || RESERVED_NICKNAMES.has(word);
}

/** The age shown on a profile: the current year minus the year of birth. */
export function ageFromBirthYear(birthYear: number, now: Date = new Date()): number {
  return now.getUTCFullYear() - birthYear;
}

/** When a check-in of `hours` made at `now` ends. */
export function checkInEnd(hours: number, now: Date): Date {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

/** The two people of a conversation in storage order (`userAId` < `userBId`). */
export function conversationPair(first: string, second: string): [string, string] {
  return first < second ? [first, second] : [second, first];
}

export type TranscriptLine = { from: 'reporter' | 'reported'; text: string; at: string };

/** A conversation's messages as a report keeps them, seen from the reporter. */
export function toTranscript(
  messages: readonly { senderId: string; text: string; createdAt: Date }[],
  reporterId: string,
): TranscriptLine[] {
  return messages.map((message) => ({
    from: message.senderId === reporterId ? 'reporter' : 'reported',
    text: message.text,
    at: message.createdAt.toISOString(),
  }));
}

/**
 * Whether a message must be refused for sharing contact details: only until each of the two has
 * sent `needed` messages (scammers and spammers go straight for them).
 */
export function contactStillBlocked(
  sentByMe: number,
  sentByPartner: number,
  needed: number,
): boolean {
  return sentByMe < needed || sentByPartner < needed;
}

/** A write refused because the value is taken (Prisma's P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

// ---- Favourites and alerts (phase 3, decision 85) ----------------------------------------------

/** Favourites a member can save. */
export const MAX_FAVORITES = 100;
/** A member hears about the same favourite spot at most once in this time… */
export const ALERT_SPOT_GAP_MS = 3 * 60 * 60 * 1000;
/** …at most this many times a day in all… */
export const ALERTS_PER_DAY = 10;
/** …and gets at most one email about favourites a day. */
export const ALERT_DAY_MS = 24 * 60 * 60 * 1000;
/** Alerts are kept this long (the caps only look one day back). */
export const ALERT_KEEP_MS = 2 * ALERT_DAY_MS;
/** Devices with notifications on, per member: a new one drops the oldest. */
export const MAX_PUSH_SUBSCRIPTIONS = 5;

export type AlertChannel = 'PUSH' | 'EMAIL';

/** What decides how (and whether) a member who saved a spot hears that someone checked in. */
export interface AlertCandidate {
  /** Push for favourites (default on). */
  favoriteAlerts: boolean;
  /** The daily email about favourites (default off). */
  favoriteEmails: boolean;
  /** Cruising's email switch: off turns every optional email off. */
  emailAlerts: boolean;
  /** Push works (VAPID keys set) and the member has a device subscribed. */
  hasPush: boolean;
}

/** One of the member's recent alerts: the spot, the channel and when. */
export type RecentAlert = { spotId: string; channel: AlertChannel; createdAt: Date };

/**
 * How a member is alerted that someone is at `spotId` (decision 85), or null: never twice for the
 * same spot within 3 hours, never more than 10 a day; by push when they have a device subscribed
 * (and favourite alerts on), else by email when they asked for it, at most one email a day.
 */
export function alertChannel(
  candidate: AlertCandidate,
  spotId: string,
  recent: readonly RecentAlert[],
  now: Date,
): AlertChannel | null {
  const dayAgo = now.getTime() - ALERT_DAY_MS;
  const today = recent.filter((alert) => alert.createdAt.getTime() > dayAgo);
  if (today.length >= ALERTS_PER_DAY) return null;
  const spotGap = now.getTime() - ALERT_SPOT_GAP_MS;
  if (today.some((alert) => alert.spotId === spotId && alert.createdAt.getTime() > spotGap)) {
    return null;
  }
  if (candidate.hasPush) return candidate.favoriteAlerts ? 'PUSH' : null;
  if (!candidate.favoriteEmails || !candidate.emailAlerts) return null;
  return today.some((alert) => alert.channel === 'EMAIL') ? null : 'EMAIL';
}

export type PushKind = 'favorite' | 'message';

const PUSH_TEXT = {
  en: { favorite: 'Someone is at one of your favourite spots', message: 'New message' },
  es: { favorite: 'Hay alguien en uno de tus lugares favoritos', message: 'Mensaje nuevo' },
} as const;

/**
 * A notification's payload: it names neither the spot nor a person, and opens the favourites or
 * the messages in the account's language.
 */
export function pushPayload(
  kind: PushKind,
  locale: 'en' | 'es',
): { title: string; body: string; url: string; tag: string } {
  return {
    title: 'Cruising',
    body: PUSH_TEXT[locale][kind],
    url: `/${locale}${kind === 'favorite' ? '/favorites' : '/messages'}`,
    tag: kind === 'favorite' ? 'cruising-favorite' : 'cruising-message',
  };
}
