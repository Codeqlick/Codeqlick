import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import {
  bellCount,
  isNotificationKind,
  NOTIFICATION_KINDS,
  notificationCount,
  notificationHref,
  notificationsEndpoint,
  notificationView,
  verificationOutcome,
  type CruisingNotification,
} from './cruising-notifications';

const ID = '11111111-1111-4111-8111-111111111111';

const item = (over: Partial<CruisingNotification> = {}): CruisingNotification => ({
  id: ID,
  kind: 'MESSAGE',
  data: {},
  spot: null,
  read: false,
  at: '2026-11-16T12:00:00.000Z',
  ...over,
});

describe('Cruising notification centre (decision 98)', () => {
  it('names every kind in both languages', () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(en.Cruising.notifications.kinds[kind]).toBeTruthy();
      expect(es.Cruising.notifications.kinds[kind]).toBeTruthy();
    }
    expect(isNotificationKind('WINK')).toBe(true);
    expect(isNotificationKind('ROOM_MESSAGE_FROM_THE_FUTURE')).toBe(false);
  });

  it('links each notification to what it is about', () => {
    expect(notificationHref(item({ data: { conversationId: ID } }))).toBe(
      `/cruising/messages/${ID}`,
    );
    expect(notificationHref(item({ data: { conversationId: '../admin' } }))).toBe(
      '/cruising/messages',
    );
    expect(notificationHref(item({ kind: 'WINK' }))).toBe('/cruising/notifications?view=winks');
    expect(notificationHref(item({ kind: 'VISITS' }))).toBe(
      '/cruising/notifications?view=visitors',
    );
    expect(
      notificationHref(
        item({
          kind: 'FAVORITE_ACTIVITY',
          data: { spotId: ID },
          spot: { slug: 'cove', name: 'Cove' },
        }),
      ),
    ).toBe('/cruising/spots/cove');
    expect(notificationHref(item({ kind: 'SAFETY_ALERT', data: { spotId: ID } }))).toBe(
      '/cruising/favorites',
    );
    expect(notificationHref(item({ kind: 'MEETUP_CANCELLED' }))).toBe('/cruising/meetups');
    expect(notificationHref(item({ kind: 'SPOT_REJECTED' }))).toBe('/cruising/my-spots');
    expect(notificationHref(item({ kind: 'VERIFICATION_DECIDED' }))).toBe('/cruising/me');
    expect(notificationHref(item({ kind: 'SOMETHING_NEW' }))).toBeNull();
  });

  it('reads counts and decisions defensively', () => {
    expect(notificationCount(item({ data: { count: 4 } }))).toBe(4);
    expect(notificationCount(item({ data: { count: 'x' } }))).toBe(1);
    expect(notificationCount(item())).toBe(1);
    expect(verificationOutcome(item({ data: { status: 'APPROVED' } }))).toBe('APPROVED');
    expect(verificationOutcome(item({ data: { status: 'REJECTED' } }))).toBe('REJECTED');
    expect(verificationOutcome(item({ data: {} }))).toBe('WITHDRAWN');
  });

  it('shows the bell count up to 99', () => {
    expect(bellCount(0)).toBe('');
    expect(bellCount(-1)).toBe('');
    expect(bellCount(7)).toBe('7');
    expect(bellCount(150)).toBe('99+');
  });

  it('picks a view and asks its own route handler', () => {
    expect(notificationView('winks')).toBe('winks');
    expect(notificationView('visitors')).toBe('visitors');
    expect(notificationView('other')).toBe('all');
    expect(notificationView(undefined)).toBe('all');
    expect(notificationsEndpoint('es', true)).toBe('/es/api/notifications');
    expect(notificationsEndpoint('en', false)).toBe('/en/cruising/api/notifications');
  });
});
