import type { CruisingNotificationKind } from '../../generated/prisma/enums.js';

/**
 * Cruising phase 6's pure rules (architecture 4.15, decisions 97 and 98): winks, profile visits
 * and the notification centre.
 */

export type NotificationKind = CruisingNotificationKind;

/** Every kind the centre knows, in the database's order (the album and rooms add theirs). */
export const NOTIFICATION_KINDS = [
  'MESSAGE',
  'WINK',
  'VISITS',
  'FAVORITE_ACTIVITY',
  'MEETUP_PLANNED',
  'MEETUP_CANCELLED',
  'SAFETY_ALERT',
  'ALBUM_SHARED',
  'SPOT_PUBLISHED',
  'SPOT_REJECTED',
  'SPOT_REMOVED',
  'MEDIA_REMOVED',
  'VERIFICATION_DECIDED',
] as const satisfies readonly NotificationKind[];

/** What a notification carries: ids, a status or a count, never a text or a person. */
export type NotificationData = Record<string, string | number | boolean>;

export const DAY_MS = 24 * 60 * 60 * 1000;
/** Notifications, winks and visits are kept this long… */
export const NOTIFICATION_KEEP_MS = 30 * DAY_MS;
export const WINK_KEEP_MS = 30 * DAY_MS;
export const VISIT_KEEP_MS = 30 * DAY_MS;
/** …and a member keeps at most this many notifications (the oldest go first). */
export const MAX_NOTIFICATIONS = 200;
/** Winks a member sends in 24 hours; one per pair in that time. */
export const WINKS_PER_DAY = 30;
/** The visitors and winks shown. */
export const MAX_VISITORS = 100;
export const MAX_WINKS_SHOWN = 100;

/** The kinds whose unread notification counts what happened rather than adding one each time. */
const COUNTED: ReadonlySet<NotificationKind> = new Set(['WINK', 'VISITS']);

/** The calendar day (UTC) of `now`, at midnight: how visits are grouped. */
export function utcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * The key that folds notifications into one while unread (null: each one stands alone): one per
 * conversation with new messages, one per favourite spot with activity, one for the winks and one
 * per day for the visits.
 */
export function notificationGroup(
  kind: NotificationKind,
  data: NotificationData,
  now: Date,
): string | null {
  switch (kind) {
    case 'MESSAGE':
      return typeof data.conversationId === 'string' ? `message:${data.conversationId}` : null;
    case 'FAVORITE_ACTIVITY':
      return typeof data.spotId === 'string' ? `favorite:${data.spotId}` : null;
    case 'WINK':
      return 'wink';
    case 'VISITS':
      return `visits:${utcDay(now).toISOString().slice(0, 10)}`;
    default:
      return null;
  }
}

/** The data an unread grouped notification ends with: counted kinds add up, the rest is replaced. */
export function mergeNotificationData(
  kind: NotificationKind,
  previous: unknown,
  next: NotificationData,
): NotificationData {
  if (!COUNTED.has(kind)) return next;
  const before =
    previous && typeof previous === 'object' && 'count' in previous
      ? Number((previous as { count: unknown }).count) || 0
      : 0;
  return { ...next, count: before + (Number(next.count) || 1) };
}

/** How many of `total` notifications go when a member may keep `max`. */
export function notificationsOver(total: number, max = MAX_NOTIFICATIONS): number {
  return Math.max(0, total - max);
}

export type WinkOutcome = 'send' | 'already' | 'limit';

/**
 * Whether a wink goes (decision 97): one per pair a day (a second one changes nothing) and
 * `WINKS_PER_DAY` in 24 hours.
 */
export function winkOutcome(sentToday: number, alreadyWinkedToday: boolean): WinkOutcome {
  if (alreadyWinkedToday) return 'already';
  return sentToday >= WINKS_PER_DAY ? 'limit' : 'send';
}

/**
 * Whether opening a profile is recorded as a visit (decision 97): visits are reciprocal, so both
 * members must have turned them on; never one's own profile.
 */
export function recordsVisit(
  viewer: { userId: string; showVisits: boolean },
  viewed: { userId: string; showVisits: boolean },
): boolean {
  return viewer.userId !== viewed.userId && viewer.showVisits && viewed.showVisits;
}
