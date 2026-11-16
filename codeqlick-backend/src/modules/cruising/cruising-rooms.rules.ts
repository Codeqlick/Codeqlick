/** Pure rules of Cruising's city chat rooms (architecture 4.15, phase 6, decision 100). */
import { sharesContact } from '../swipe/swipe-chat-guard.js';

/** Longest room message. */
export const ROOM_MESSAGE_MAX = 500;
/** Messages a member can post a minute, and a day (across rooms). */
export const ROOM_PER_MINUTE = 10;
export const ROOM_PER_DAY = 200;
/** Messages a room shows at once. */
export const ROOM_PAGE = 100;
/** Messages are deleted once they are this old. */
export const ROOM_KEEP_MS = 7 * 24 * 60 * 60 * 1000;
/** Accounts younger than this can read but not post. */
export const ROOM_MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;
/** Rooms of my country's busiest that `/rooms` lists. */
export const ROOM_BUSIEST = 5;
/** Rooms `/rooms` lists at most. */
export const MAX_ROOMS = 30;

/** A permanent mute: a date nobody reaches. */
export const PERMANENT_MUTE = new Date('9999-12-31T00:00:00.000Z');

/** Reports of a room message that hide it at once, until the team reviews it. */
export const ROOM_HIDE_AT_ONCE = ['MINOR', 'ILLEGAL', 'HARASSMENT'] as const;

export function roomHidesAtOnce(reason: string): boolean {
  return (ROOM_HIDE_AT_ONCE as readonly string[]).includes(reason);
}

const HOUR_MS = 60 * 60 * 1000;
const MUTE_MS: Record<string, number | null> = {
  '24h': 24 * HOUR_MS,
  '7d': 7 * 24 * HOUR_MS,
  '30d': 30 * 24 * HOUR_MS,
  permanent: null,
};

/** Until when a mute of `duration` starting at `now` lasts. */
export function muteUntil(duration: '24h' | '7d' | '30d' | 'permanent', now: Date): Date {
  const ms = MUTE_MS[duration];
  return ms === null || ms === undefined ? PERMANENT_MUTE : new Date(now.getTime() + ms);
}

/** Muted right now. */
export function isMuted(until: Date | null | undefined, now: Date): boolean {
  return !!until && until > now;
}

/**
 * A link, beyond what the contact filter already catches: a scheme, `www.`, or anything that looks
 * like a domain followed by a path (`t.me/x`, `example.de/x`).
 */
const LINK =
  /[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\b[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.[a-z]{2,24}\//iu;

export function hasLink(text: string): boolean {
  return LINK.test(text);
}

/**
 * Why a room message is refused for what it says, or null: rooms never take contact details (the
 * contact filter of decision 100, always on) nor links.
 */
export function roomTextRefusal(text: string): 'contact' | 'link' | null {
  if (hasLink(text)) return 'link';
  if (sharesContact(text)) return 'contact';
  return null;
}

/** Why a member can't post in rooms now. */
export type RoomPostingBlock = 'nickname' | 'new-account' | 'muted' | 'suspended';

export interface RoomPoster {
  hasNickname: boolean;
  suspended: boolean;
  accountCreatedAt: Date;
  roomMutedUntil: Date | null;
}

/**
 * Whether an entered member may post in rooms: a nickname, not suspended, not muted, and an
 * account over 24 hours old. Null: they may.
 */
export function roomPostingBlock(poster: RoomPoster, now: Date): RoomPostingBlock | null {
  if (poster.suspended) return 'suspended';
  if (isMuted(poster.roomMutedUntil, now)) return 'muted';
  if (now.getTime() - poster.accountCreatedAt.getTime() < ROOM_MIN_ACCOUNT_AGE_MS) {
    return 'new-account';
  }
  if (!poster.hasNickname) return 'nickname';
  return null;
}

/** Whether another message fits the rates, given those I posted in the last minute and day. */
export function roomRateAllows(lastMinute: number, lastDay: number): boolean {
  return lastMinute < ROOM_PER_MINUTE && lastDay < ROOM_PER_DAY;
}

export interface RoomListEntry {
  countryCode: string;
  citySlug: string;
  city: string;
  lastAt: Date | null;
  count24h: number;
}

/**
 * My rooms: the cities of my favourites, of my trips and my country's busiest, each once (in that
 * order of preference), sorted by the latest message (rooms without one last, by name), at most
 * `MAX_ROOMS`.
 */
export function mergeRooms(...groups: readonly (readonly RoomListEntry[])[]): RoomListEntry[] {
  const seen = new Map<string, RoomListEntry>();
  for (const group of groups) {
    for (const room of group) {
      const key = `${room.countryCode}/${room.citySlug}`;
      if (!seen.has(key)) seen.set(key, room);
    }
  }
  return [...seen.values()]
    .sort((a, b) => {
      const at = (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0);
      return at !== 0 ? at : a.city.localeCompare(b.city);
    })
    .slice(0, MAX_ROOMS);
}
