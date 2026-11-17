import { cruisingPath } from './cruising';

/**
 * Cruising's photos and videos (architecture 4.15, phase 4, decision 87): the pure helpers the
 * member's media page, the file proxies and the unit tests share. No server-only code.
 */

export type MediaKind = 'PHOTO' | 'VIDEO';
export type MediaStatus = 'PROCESSING' | 'LIVE' | 'HIDDEN' | 'FAILED';
export type VerificationStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
/** The profile's album, or the private one shared from a conversation (decision 99). */
export type MediaAlbum = 'PUBLIC' | 'PRIVATE';
export const MEDIA_ALBUMS: readonly MediaAlbum[] = ['PUBLIC', 'PRIVATE'];

export function isMediaAlbum(value: unknown): value is MediaAlbum {
  return value === 'PUBLIC' || value === 'PRIVATE';
}

/** The API's limits per album (they come back in `GET /cruising/media`; these are the fallback). */
export const MEDIA_LIMITS = { photos: 12, videos: 4, perDay: 20 } as const;
export type MediaLimits = { photos: number; videos: number; perDay: number };

/** Bytes the API accepts per upload. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
/** Longest video, in seconds. */
export const MAX_VIDEO_SECONDS = 60;

export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;

/** How often the page asks again while an item is still processing. */
export const MEDIA_POLL_MS = 4000;

export type MyMedia = {
  id: string;
  ref: string;
  kind: MediaKind;
  status: MediaStatus;
  album: MediaAlbum;
  cover: boolean;
  position: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  failure: string | null;
  createdAt: string;
};

/** The kind of a file picked in the browser, from its type, or null when it is neither. */
export function mediaKindOf(file: { type: string }): MediaKind | null {
  if (PHOTO_TYPES.some((type) => type === file.type)) return 'PHOTO';
  if (VIDEO_TYPES.some((type) => type === file.type)) return 'VIDEO';
  return null;
}

export type MediaCounts = { photos: number; videos: number };

/**
 * What holds a place against the limits, as the API counts it: a FAILED item doesn't. The limits
 * are per album: pass `album` to count one of them (items without an album count as PUBLIC).
 */
export function mediaCounts(
  items: readonly (Pick<MyMedia, 'kind' | 'status'> & { album?: MediaAlbum })[],
  album?: MediaAlbum,
): MediaCounts {
  let photos = 0;
  let videos = 0;
  for (const item of items) {
    if (item.status === 'FAILED') continue;
    if (album && (item.album ?? 'PUBLIC') !== album) continue;
    if (item.kind === 'PHOTO') photos += 1;
    else videos += 1;
  }
  return { photos, videos };
}

/** Whether one more of a kind fits in the limits. */
export function canAddMedia(
  kind: MediaKind,
  counts: MediaCounts,
  limits: Pick<MediaLimits, 'photos' | 'videos'>,
): boolean {
  return kind === 'PHOTO' ? counts.photos < limits.photos : counts.videos < limits.videos;
}

/** Whether any item is still being processed (the page then asks again every few seconds). */
export function hasProcessing(items: readonly Pick<MyMedia, 'status'>[]): boolean {
  return items.some((item) => item.status === 'PROCESSING');
}

/**
 * The 0-based place an item takes when moved one step up (-1) or down (+1) among the items of its
 * own album, or null when it is already at that end. The API's `position` is an index in my whole
 * list, so this is the index of the neighbour of the same album in that list.
 */
export function movedPosition(
  items: readonly (Pick<MyMedia, 'id'> & { album?: MediaAlbum })[],
  id: string,
  step: -1 | 1,
): number | null {
  const at = items.findIndex((item) => item.id === id);
  if (at < 0) return null;
  const album = items[at]?.album ?? 'PUBLIC';
  for (let next = at + step; next >= 0 && next < items.length; next += step) {
    if ((items[next]?.album ?? 'PUBLIC') === album) return next;
  }
  return null;
}

/** Keys of `Cruising.media.errors`: what a refused upload or change says. */
export type MediaErrorKey =
  | 'consent'
  | 'invalid'
  | 'session'
  | 'notVerified'
  | 'limit'
  | 'tooLarge'
  | 'tooManyToday'
  | 'diskFull'
  | 'error';

/** The friendly message for the API's status on an upload or a change (400/403/409/413/429/507). */
export function mediaErrorKey(status: number): MediaErrorKey {
  switch (status) {
    case 400:
      return 'invalid';
    case 401:
      return 'session';
    case 403:
      return 'notVerified';
    case 409:
      return 'limit';
    case 413:
      return 'tooLarge';
    case 429:
      return 'tooManyToday';
    case 507:
      return 'diskFull';
    default:
      return 'error';
  }
}

/** Keys of `Cruising.media.failures`: the API's failure codes, with a generic one for the rest. */
export type MediaFailureKey = 'unreadable' | 'tooLong' | 'blocked' | 'interrupted' | 'unknown';

export function mediaFailureKey(code: string | null | undefined): MediaFailureKey {
  switch (code) {
    case 'unreadable':
      return 'unreadable';
    case 'too-long':
      return 'tooLong';
    case 'blocked':
      return 'blocked';
    case 'interrupted':
      return 'interrupted';
    default:
      return 'unknown';
  }
}

/** A photo or video as the team's lists name it. */
export type MediaSummary = { id: string; ref: string; kind: MediaKind; status: MediaStatus };

/**
 * The photo or video a report names: `target` is `{ type: 'MEDIA', media: {...} | null }`.
 * Null when the target isn't one or the item is already gone.
 */
export function reportedMedia(target: unknown): MediaSummary | null {
  if (!target || typeof target !== 'object') return null;
  const media = (target as { media?: unknown }).media;
  if (!media || typeof media !== 'object') return null;
  const { id, ref, kind, status } = media as Record<string, unknown>;
  if (typeof id !== 'string' || typeof ref !== 'string') return null;
  if (kind !== 'PHOTO' && kind !== 'VIDEO') return null;
  if (typeof status !== 'string') return null;
  return { id, ref, kind, status: status as MediaStatus };
}

/** A media id as it may appear in a path: letters, digits, dashes and underscores. */
const MEDIA_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function isMediaId(value: string): boolean {
  return MEDIA_ID.test(value);
}

/** The 8-character reference shown on each item (letters and digits, any case). */
export function isMediaRef(value: string): boolean {
  return /^[A-Za-z0-9]{8}$/.test(value);
}

// ---- Addresses ---------------------------------------------------------------------------------

/** A photo, or a video's file, as the browser asks it (the BFF proxy, never the API). */
export function mediaFileEndpoint(locale: string, onHost: boolean, id: string): string {
  return cruisingPath(locale, `/media/${id}`, onHost);
}

/** A video's poster (a still image). */
export function mediaPosterEndpoint(locale: string, onHost: boolean, id: string): string {
  return cruisingPath(locale, `/media/${id}/poster`, onHost);
}

/**
 * Where a video is uploaded. Always the route's own address (`/{locale}/cruising/api/media`),
 * on Cruising's host too: the proxy leaves this path alone (it would buffer the body), so it
 * has no short address. Nginx's 100 MB limit applies to this path.
 */
export function mediaUploadEndpoint(locale: string): string {
  return `/${locale}/cruising/api/media`;
}

/** The text on each item over the picture: `@nickname · cruising.neoqlick.com`. */
export function watermarkText(nickname: string, host = 'cruising.neoqlick.com'): string {
  return `@${nickname} · ${host}`;
}

// ---- The proxy of the files --------------------------------------------------------------------

/** A `Range` request header the proxy forwards: one or more byte ranges, nothing else. */
export function forwardableRange(value: string | null): string | null {
  if (!value) return null;
  return /^bytes=\d*-\d*(,\s*\d*-\d*)*$/.test(value.trim()) ? value.trim() : null;
}

/** The statuses of the API that reach the browser as they are; anything else is a 502. */
export function proxiedStatus(status: number): number {
  if ([200, 206, 401, 403, 404, 416].includes(status)) return status;
  return 502;
}

/**
 * The headers of a file the proxy sends: what the API says about the bytes (type, length, range)
 * and the ones this site always adds. Never cached, never indexed, shown inline.
 */
export function mediaResponseHeaders(upstream: Headers): Headers {
  const headers = new Headers();
  for (const name of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']) {
    const value = upstream.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has('Accept-Ranges')) headers.set('Accept-Ranges', 'bytes');
  headers.set('Cache-Control', 'private, no-store');
  headers.set('X-Robots-Tag', 'noindex');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Disposition', 'inline');
  return headers;
}

/** Whether a browser's `Origin` is this site (the upload route checks it: it takes cookies). */
export function sameOrigin(origin: string | null, host: string | null): boolean {
  if (!origin) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
