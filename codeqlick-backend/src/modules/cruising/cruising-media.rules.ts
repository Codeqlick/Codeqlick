/** Pure rules of Cruising's profile photos and videos (architecture 4.15, phase 4, decision 87). */

/** Photos and videos a member can have at once (PROCESSING, LIVE and HIDDEN count; FAILED doesn't). */
export const MAX_PHOTOS = 12;
export const MAX_VIDEOS = 4;
/** Uploads a member can make a day (deleting one doesn't give it back). */
export const UPLOADS_PER_DAY = 20;
/** Verification photos a member can send a day. */
export const VERIFICATIONS_PER_DAY = 5;
/** Largest photo, and largest video (the request's own limit). */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
/** Longest video; a little rounding is let through, the transcoder cuts at this length. */
export const MAX_VIDEO_SECONDS = 60;
const DURATION_TOLERANCE = 0.5;

export type MediaKind = 'PHOTO' | 'VIDEO';
export type MediaStatus = 'PROCESSING' | 'LIVE' | 'HIDDEN' | 'FAILED';
export type VideoContainer = 'mp4' | 'mov' | 'webm';
/** Why a video FAILED: codes the web turns into words. */
export type MediaFailure = 'unreadable' | 'too-long' | 'blocked' | 'interrupted';

const DAY_MS = 24 * 60 * 60 * 1000;

function startsWith(data: Uint8Array, bytes: number[], offset = 0): boolean {
  return bytes.every((byte, index) => data[offset + index] === byte);
}

function ascii(data: Uint8Array, from: number, to: number): string {
  return String.fromCharCode(...data.subarray(from, to));
}

/**
 * The container of a video from its first bytes (the name and Content-Type are never trusted):
 * MP4 and QuickTime start with an `ftyp` box (QuickTime's brand is `qt  `; older ones start with a
 * `moov`, `mdat`, `wide` or `free` atom), WebM with the EBML header and the `webm` doc type.
 * Anything else is not taken as a video. ffprobe reads it afterwards.
 */
export function detectVideoType(head: Uint8Array): VideoContainer | undefined {
  if (head.length >= 12 && ascii(head, 4, 8) === 'ftyp') {
    return ascii(head, 8, 12) === 'qt  ' ? 'mov' : 'mp4';
  }
  if (head.length >= 8 && ['moov', 'mdat', 'wide', 'free'].includes(ascii(head, 4, 8))) {
    return 'mov';
  }
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) {
    return ascii(head, 0, Math.min(head.length, 64)).includes('webm') ? 'webm' : undefined;
  }
  return undefined;
}

export interface ProbeResult {
  /** Seconds, rounded to a whole second for display (at least 1). */
  durationSeconds: number;
  /** The exact duration. */
  duration: number;
  width: number;
  height: number;
  hasAudio: boolean;
}

/**
 * Reads `ffprobe -print_format json -show_format -show_streams`. Null when there is no video
 * stream or no duration (not a video we can take).
 */
export function parseProbe(json: string): ProbeResult | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const { streams, format } = data as {
    streams?: { codec_type?: string; width?: number; height?: number; duration?: string }[];
    format?: { duration?: string };
  };
  const video = streams?.find((stream) => stream.codec_type === 'video');
  if (!video?.width || !video.height) return null;
  const duration = Number(format?.duration ?? video.duration);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return {
    duration,
    durationSeconds: Math.max(1, Math.round(duration)),
    width: video.width,
    height: video.height,
    hasAudio: !!streams?.some((stream) => stream.codec_type === 'audio'),
  };
}

/** Whether a probed video is short enough. */
export function videoLengthAllowed(duration: number): boolean {
  return duration <= MAX_VIDEO_SECONDS + DURATION_TOLERANCE;
}

/**
 * The transcoder's arguments (no shell: an array for spawn): H.264/AAC MP4 inside 1280×720
 * (720×1280 upright), at most 60 s, no metadata or chapters (no camera data or location), the index
 * first so it plays while it loads, at most 2 threads.
 */
export function transcodeArgs(input: string, output: string): string[] {
  const fit = (landscape: number, portrait: number, side: 'iw' | 'ih') =>
    `if(gte(iw\\,ih)\\,min(${landscape}\\,${side})\\,min(${portrait}\\,${side}))`;
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-y',
    '-i',
    input,
    '-map',
    '0:v:0',
    '-map',
    '0:a:0?',
    '-t',
    String(MAX_VIDEO_SECONDS),
    '-vf',
    `scale=w='${fit(1280, 720, 'iw')}':h='${fit(720, 1280, 'ih')}':force_original_aspect_ratio=decrease:force_divisible_by=2`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '26',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    '-ac',
    '2',
    '-map_metadata',
    '-1',
    '-map_chapters',
    '-1',
    '-sn',
    '-dn',
    '-movflags',
    '+faststart',
    '-threads',
    '2',
    '-f',
    'mp4',
    output,
  ];
}

/** Where the poster frame is taken: a second in, or the middle of a shorter video. */
export function posterTime(duration: number): number {
  return Math.min(1, duration / 2);
}

/** The poster's arguments: one frame at `at` seconds, as PNG on stdout (sharp makes the WebP). */
export function posterArgs(input: string, at: number): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-nostdin',
    '-ss',
    at.toFixed(2),
    '-i',
    input,
    '-frames:v',
    '1',
    '-map_metadata',
    '-1',
    '-f',
    'image2pipe',
    '-vcodec',
    'png',
    'pipe:1',
  ];
}

export type ByteRange = { start: number; end: number };

/**
 * An HTTP `Range` header for a file of `size` bytes: null serves the whole file (no header, a
 * header we don't understand or several ranges), 'unsatisfiable' answers 416.
 */
export function parseRange(
  header: string | undefined,
  size: number,
): ByteRange | null | 'unsatisfiable' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, from, to] = match as unknown as [string, string, string];
  if (from === '' && to === '') return null;
  if (from === '') {
    const suffix = Number(to);
    if (suffix === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(from);
  if (start >= size) return 'unsatisfiable';
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  if (end < start) return null;
  return { start, end };
}

/** What decides whether a person may see a media file. */
export interface MediaAccess {
  viewerId: string;
  viewerIsAdmin: boolean;
  /** The viewer's Cruising profile: entered (current terms) and with a nickname. */
  viewerEntered: boolean;
  viewerHasNickname: boolean;
  ownerId: string;
  status: MediaStatus;
  ownerSuspended: boolean;
  /** A block between the two, either way. */
  blocked: boolean;
}

/**
 * Who sees a photo or video (decision 87): its owner and the team always; anyone else only a LIVE
 * item of a member who isn't suspended, when they entered Cruising with a nickname (as profiles
 * ask) and no block stands between them. Never signed-out visitors.
 */
export function canSeeMedia(access: MediaAccess): boolean {
  if (access.viewerId === access.ownerId || access.viewerIsAdmin) return true;
  return (
    access.status === 'LIVE' &&
    access.viewerEntered &&
    access.viewerHasNickname &&
    !access.ownerSuspended &&
    !access.blocked
  );
}

/** Reports of media that hide it at once, until the team reviews it. */
export const MEDIA_HIDE_AT_ONCE = ['MINOR', 'NON_CONSENSUAL', 'STOLEN', 'ILLEGAL'] as const;

export function mediaHidesAtOnce(reason: string): boolean {
  return (MEDIA_HIDE_AT_ONCE as readonly string[]).includes(reason);
}

export type ReportTargetKind =
  'spot' | 'review' | 'profile' | 'conversation' | 'media' | 'meetup' | 'alert';

/**
 * The reasons each target takes: WRONG_INFO only on a spot; NON_CONSENSUAL and STOLEN only on media
 * or a profile; DANGER and WRONG_INFO never on media.
 */
export function reasonAllowedOn(target: ReportTargetKind, reason: string): boolean {
  if (reason === 'WRONG_INFO') return target === 'spot';
  if (reason === 'NON_CONSENSUAL' || reason === 'STOLEN') {
    return target === 'media' || target === 'profile';
  }
  if (reason === 'DANGER') return target !== 'media';
  return true;
}

/**
 * The cover of a member: the LIVE photo they chose, else their first LIVE photo (by position).
 * Items come in position order.
 */
export function coverOf<
  T extends { id: string; kind: MediaKind; status: MediaStatus; cover: boolean },
>(items: readonly T[]): string | null {
  const photos = items.filter((item) => item.kind === 'PHOTO' && item.status === 'LIVE');
  return (photos.find((item) => item.cover) ?? photos[0])?.id ?? null;
}

/** My list in its new order once `id` moves to `index` (clamped); unknown ids change nothing. */
export function reorder(ids: readonly string[], id: string, index: number): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return [...ids];
  const rest = ids.filter((other) => other !== id);
  const to = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, to), id, ...rest.slice(to)];
}

/**
 * A daily allowance counted from the first use of the day: the new count and window start when one
 * more is allowed, or null when `limit` is reached. A window older than a day starts again.
 */
export function useDailyAllowance(
  count: number,
  since: Date | null,
  limit: number,
  now: Date,
): { count: number; since: Date } | null {
  if (!since || now.getTime() - since.getTime() >= DAY_MS) return { count: 1, since: now };
  if (count >= limit) return null;
  return { count: count + 1, since };
}

/** Whether there is room for another item of `kind`, given the active ones. */
export function hasRoom(kind: MediaKind, activePhotos: number, activeVideos: number): boolean {
  return kind === 'PHOTO' ? activePhotos < MAX_PHOTOS : activeVideos < MAX_VIDEOS;
}

const REF = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

/** A media reference as a person types it (any case, spaces and a leading # ignored), or null. */
export function normalizeMediaRef(value: string | null | undefined): string | null {
  const ref = (value ?? '').trim().replace(/^#/, '').replace(/\s+/g, '').toUpperCase();
  return REF.test(ref) ? ref : null;
}

/** The watermark of Cruising's photos and posters. */
export function cruisingWatermark(nickname: string | null | undefined): string {
  return `${nickname ? `@${nickname} · ` : ''}cruising.codeqlick.com`;
}
