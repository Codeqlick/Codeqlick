import { cruisingPath, SLUG, type CruisingReportReason } from './cruising';

/**
 * Cruising's city chat (architecture 4.15, phase 6, decision 100) and the private album's grants
 * (decision 99): the pure helpers the pages, the polling route and the unit tests share. No
 * server-only code.
 */

/** Longest room message, in characters (the API's). */
export const ROOM_MESSAGE_MAX = 500;

/** How often an open room asks for new messages while it is visible. */
export const ROOM_POLL_MS = 5000;

/** Reasons a room message can be reported for (not WRONG_INFO, NON_CONSENSUAL or STOLEN). */
export const ROOM_REPORT_REASONS: readonly CruisingReportReason[] = [
  'MINOR',
  'ILLEGAL',
  'DANGER',
  'HARASSMENT',
  'SPAM',
  'OTHER',
];

export type RoomMessage = {
  id: string;
  nickname: string;
  verified: boolean;
  text: string;
  at: string;
  mine: boolean;
};

export type RoomPostingReason = 'nickname' | 'new-account' | 'muted' | 'suspended';

/** Whether I can post, and why not (`until` is when a mute ends, null for good or not muted). */
export type RoomPosting = {
  allowed: boolean;
  reason: RoomPostingReason | null;
  until: string | null;
};

export type RoomSnapshot = { items: RoomMessage[]; posting: RoomPosting };

export type RoomSummary = {
  countryCode: string;
  citySlug: string;
  city: string;
  lastAt: string | null;
  count24h: number;
};

/** The room's page, under the city's own address segments (`/cruising/rooms/es/madrid`). */
export function roomHref(countryCode: string, citySlug: string): string {
  return `/cruising/rooms/${countryCode.toLowerCase()}/${citySlug}`;
}

export const ROOMS_HREF = '/cruising/rooms';

/** What the open room asks for new messages (the BFF route handler, never the API). */
export function roomMessagesEndpoint(
  locale: string,
  onHost: boolean,
  countryCode: string,
  citySlug: string,
): string {
  return cruisingPath(
    locale,
    `/api/rooms/${countryCode.toLowerCase()}/${citySlug}/messages`,
    onHost,
  );
}

/** A country code and a city slug as they may appear in a room's path. */
export function isRoomPath(countryCode: string, citySlug: string): boolean {
  return /^[a-z]{2}$/i.test(countryCode) && SLUG.test(citySlug);
}

/** Adds the messages not already listed, oldest first. */
export function mergeRoomMessages(current: RoomMessage[], incoming: RoomMessage[]): RoomMessage[] {
  const known = new Set(current.map((message) => message.id));
  return [...current, ...incoming.filter((message) => !known.has(message.id))].toSorted((a, b) =>
    a.at.localeCompare(b.at),
  );
}

/** Keeps the last `max` messages: a room left open for hours doesn't grow without end. */
export function trimRoomMessages(messages: RoomMessage[], max = 200): RoomMessage[] {
  return messages.length > max ? messages.slice(messages.length - max) : messages;
}

/** The characters used and left of a message, and whether it is too long. */
export function roomCounter(text: string): { length: number; remaining: number; over: boolean } {
  const length = text.length;
  return { length, remaining: ROOM_MESSAGE_MAX - length, over: length > ROOM_MESSAGE_MAX };
}

/** Keys of `Cruising.rooms.refusal`: why the composer is off. */
export type RoomRefusalKey = 'nickname' | 'newAccount' | 'muted' | 'suspended';

/** The refusal to show when I can't post, or null when I can. */
export function postingRefusalKey(posting: RoomPosting): RoomRefusalKey | null {
  if (posting.allowed) return null;
  switch (posting.reason) {
    case 'nickname':
      return 'nickname';
    case 'new-account':
      return 'newAccount';
    case 'muted':
      return 'muted';
    default:
      return 'suspended';
  }
}

/** Keys of `Cruising.rooms.errors`: what a refused message says. */
export type RoomSendErrorKey =
  'contact' | 'refused' | 'nickname' | 'rate' | 'gone' | 'session' | 'error';

/** The friendly message for the API's status on a posted message (400/401/403/404/409/429). */
export function roomSendErrorKey(status: number): RoomSendErrorKey {
  switch (status) {
    case 400:
      return 'contact';
    case 401:
      return 'session';
    case 403:
      return 'refused';
    case 404:
      return 'gone';
    case 409:
      return 'nickname';
    case 429:
      return 'rate';
    default:
      return 'error';
  }
}

/** The statuses of the API that reach the poll as they are; anything else is a 502. */
export function roomProxiedStatus(status: number): number {
  return [401, 403, 404, 429].includes(status) ? status : 502;
}

/** Reads what the room's route answers, or null when it isn't a snapshot. */
export function readRoomSnapshot(body: unknown): RoomSnapshot | null {
  if (!body || typeof body !== 'object') return null;
  const { items, posting } = body as { items?: unknown; posting?: unknown };
  if (!Array.isArray(items)) return null;
  const valid = items.filter(
    (item): item is RoomMessage =>
      !!item &&
      typeof item === 'object' &&
      typeof (item as RoomMessage).id === 'string' &&
      typeof (item as RoomMessage).text === 'string' &&
      typeof (item as RoomMessage).at === 'string',
  );
  const state = (posting ?? {}) as Partial<RoomPosting>;
  return {
    items: valid,
    posting: {
      allowed: state.allowed ?? true,
      reason: state.reason ?? null,
      until: state.until ?? null,
    },
  };
}

/** Whether a mute is still in force: a date in the future (null is no mute, or for good). */
export function isMuteActive(until: string | null | undefined, now = new Date()): boolean {
  if (!until) return false;
  const time = Date.parse(until);
  return Number.isNaN(time) ? false : time > now.getTime();
}

/** A reported room message as the team sees it: where it was posted and whether it is hidden. */
export type ReportedRoomMessage = {
  id: string;
  countryCode: string;
  citySlug: string;
  hidden: boolean;
};

/**
 * The room message a report names: `target` is `{ type: 'ROOM_MESSAGE', roomMessage: {...} | null }`.
 * Null when the target isn't one or the message is already gone.
 */
export function reportedRoomMessage(target: unknown): ReportedRoomMessage | null {
  if (!target || typeof target !== 'object') return null;
  const message = (target as { roomMessage?: unknown }).roomMessage;
  if (!message || typeof message !== 'object') return null;
  const { id, countryCode, citySlug, hidden } = message as Record<string, unknown>;
  if (typeof id !== 'string' || typeof countryCode !== 'string' || typeof citySlug !== 'string') {
    return null;
  }
  return { id, countryCode, citySlug, hidden: hidden === true };
}

/** A room message id as it may appear in a request. */
export function isRoomMessageId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** The people I shared my private album with, and those who shared theirs with me. */
export type AlbumGrant = { nickname: string; at: string };
export type AlbumGrants = { given: AlbumGrant[]; received: AlbumGrant[] };

export const NO_GRANTS: AlbumGrants = { given: [], received: [] };

export function hasGiven(grants: AlbumGrants, nickname: string): boolean {
  return grants.given.some((grant) => grant.nickname === nickname);
}

export function hasReceived(grants: AlbumGrants, nickname: string): boolean {
  return grants.received.some((grant) => grant.nickname === nickname);
}
