/** Pure rules of Cruising (architecture 4.15): slugs, coordinates, the map's box, ratings, statuses. */

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
