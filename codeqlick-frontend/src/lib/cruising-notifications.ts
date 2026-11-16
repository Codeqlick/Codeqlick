import { cruisingPath, spotHref } from './cruising';

/**
 * Cruising's phase 6 (architecture 4.15): winks and profile visits (decision 97) and the
 * notification centre (decision 98). Shapes mirror the API's; the helpers are pure (server and
 * browser).
 */

/** Every kind the centre knows (the private album and the city chat add theirs). */
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
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export function isNotificationKind(value: unknown): value is NotificationKind {
  return (NOTIFICATION_KINDS as readonly unknown[]).includes(value);
}

export type CruisingNotification = {
  id: string;
  kind: string;
  /** Ids, a status or a count: never a text or a person. */
  data: Record<string, string | number | boolean>;
  /** The spot it is about while it is LIVE. */
  spot: { slug: string; name: string } | null;
  read: boolean;
  at: string;
};

export type CruisingWink = { nickname: string; verified: boolean; at: string; mutual: boolean };
export type CruisingVisitor = { nickname: string; verified: boolean; at: string };

/** The bell asks every minute (and on every navigation). */
export const BELL_POLL_MS = 60_000;

/** The views of `/notifications`: everything, the winks received and my visitors. */
export const NOTIFICATION_VIEWS = ['all', 'winks', 'visitors'] as const;
export type NotificationView = (typeof NOTIFICATION_VIEWS)[number];

export function notificationView(value: string | undefined): NotificationView {
  return (NOTIFICATION_VIEWS as readonly string[]).includes(value ?? '')
    ? (value as NotificationView)
    : 'all';
}

export const NOTIFICATIONS_HREF = '/cruising/notifications';

/** Where the bell asks for the unread count (the BFF route handler, never the API). */
export function notificationsEndpoint(locale: string, onHost: boolean): string {
  return cruisingPath(locale, '/api/notifications', onHost);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where a notification leads (a link inside Cruising), or null when there is nothing to open. */
export function notificationHref(item: CruisingNotification): string | null {
  const id = (key: string) => {
    const value = item.data[key];
    return typeof value === 'string' && UUID.test(value) ? value : null;
  };
  switch (item.kind) {
    case 'MESSAGE': {
      const conversation = id('conversationId');
      return conversation ? `/cruising/messages/${conversation}` : '/cruising/messages';
    }
    case 'ALBUM_SHARED': {
      const conversation = id('conversationId');
      return conversation ? `/cruising/messages/${conversation}` : '/cruising/messages';
    }
    case 'WINK':
      return `${NOTIFICATIONS_HREF}?view=winks`;
    case 'VISITS':
      return `${NOTIFICATIONS_HREF}?view=visitors`;
    case 'FAVORITE_ACTIVITY':
    case 'SAFETY_ALERT':
      return item.spot ? spotHref(item.spot.slug) : '/cruising/favorites';
    case 'MEETUP_PLANNED':
    case 'MEETUP_CANCELLED':
      return '/cruising/meetups';
    case 'SPOT_PUBLISHED':
      return item.spot ? spotHref(item.spot.slug) : '/cruising/my-spots';
    case 'SPOT_REJECTED':
    case 'SPOT_REMOVED':
      return '/cruising/my-spots';
    case 'MEDIA_REMOVED':
    case 'VERIFICATION_DECIDED':
      return '/cruising/me';
    default:
      return null;
  }
}

/** The count a grouped notification carries (winks, visits), at least 1. */
export function notificationCount(item: CruisingNotification): number {
  const count = Number(item.data.count);
  return Number.isInteger(count) && count > 0 ? count : 1;
}

/** The verification decision a notification carries. */
export function verificationOutcome(
  item: CruisingNotification,
): 'APPROVED' | 'REJECTED' | 'WITHDRAWN' {
  const status = item.data.status;
  return status === 'APPROVED' || status === 'REJECTED' ? status : 'WITHDRAWN';
}

/** The bell's label count: 99+ past 99. */
export function bellCount(unread: number): string {
  if (!Number.isFinite(unread) || unread <= 0) return '';
  return unread > 99 ? '99+' : String(Math.floor(unread));
}
