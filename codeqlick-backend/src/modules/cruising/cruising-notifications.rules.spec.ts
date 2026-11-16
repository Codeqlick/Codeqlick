import { describe, expect, it } from 'vitest';
import { CruisingNotificationKind } from '../../generated/prisma/enums.js';
import {
  mergeNotificationData,
  notificationGroup,
  NOTIFICATION_KINDS,
  notificationsOver,
  recordsVisit,
  utcDay,
  winkOutcome,
  WINKS_PER_DAY,
} from './cruising-notifications.rules.js';
import { alertAllowed, pushPayload } from './cruising.rules.js';

const NOW = new Date('2026-11-16T23:30:00Z');
const on = (userId: string) => ({ userId, showVisits: true });
const off = (userId: string) => ({ userId, showVisits: false });

describe('Cruising phase 6 rules', () => {
  it('knows every kind of the database', () => {
    expect([...NOTIFICATION_KINDS].toSorted()).toEqual(
      Object.values(CruisingNotificationKind).toSorted(),
    );
    expect(NOTIFICATION_KINDS).toContain('ALBUM_SHARED');
  });

  describe('winks (decision 97)', () => {
    it('sends one per pair a day, and 30 a day', () => {
      expect(winkOutcome(0, false)).toBe('send');
      expect(winkOutcome(WINKS_PER_DAY - 1, false)).toBe('send');
      expect(winkOutcome(WINKS_PER_DAY, false)).toBe('limit');
      expect(winkOutcome(0, true)).toBe('already');
      expect(winkOutcome(WINKS_PER_DAY, true)).toBe('already');
    });

    it('pushes "Someone winked at you", nothing more', () => {
      expect(pushPayload('wink', 'en')).toEqual({
        title: 'Cruising',
        body: 'Someone winked at you',
        url: '/en/notifications?view=winks',
        tag: 'cruising-wink',
      });
      expect(pushPayload('wink', 'es').body).toBe('Alguien te ha guiñado un ojo');
    });
  });

  describe('profile visits (decision 97)', () => {
    it('records a visit only when both turned visits on', () => {
      expect(recordsVisit(on('a'), on('b'))).toBe(true);
      expect(recordsVisit(off('a'), on('b'))).toBe(false);
      expect(recordsVisit(on('a'), off('b'))).toBe(false);
      expect(recordsVisit(off('a'), off('b'))).toBe(false);
    });

    it('never records one’s own profile', () => {
      expect(recordsVisit(on('a'), on('a'))).toBe(false);
    });

    it('groups by the UTC day', () => {
      expect(utcDay(NOW).toISOString()).toBe('2026-11-16T00:00:00.000Z');
    });
  });

  describe('the notification centre (decision 98)', () => {
    it('folds messages per conversation, activity per spot, winks, and visits per day', () => {
      expect(notificationGroup('MESSAGE', { conversationId: 'c1' }, NOW)).toBe('message:c1');
      expect(notificationGroup('FAVORITE_ACTIVITY', { spotId: 's1' }, NOW)).toBe('favorite:s1');
      expect(notificationGroup('WINK', { count: 1 }, NOW)).toBe('wink');
      expect(notificationGroup('VISITS', { count: 1 }, NOW)).toBe('visits:2026-11-16');
      expect(notificationGroup('VISITS', {}, new Date('2026-11-17T00:00:01Z'))).toBe(
        'visits:2026-11-17',
      );
    });

    it('lets everything else stand alone', () => {
      expect(notificationGroup('MEETUP_PLANNED', { spotId: 's1' }, NOW)).toBeNull();
      expect(notificationGroup('SPOT_PUBLISHED', { spotId: 's1' }, NOW)).toBeNull();
      expect(notificationGroup('MESSAGE', {}, NOW)).toBeNull();
    });

    it('adds up counted kinds and replaces the rest', () => {
      expect(mergeNotificationData('WINK', null, { count: 1 })).toEqual({ count: 1 });
      expect(mergeNotificationData('WINK', { count: 4 }, { count: 1 })).toEqual({ count: 5 });
      expect(mergeNotificationData('VISITS', { count: 'x' }, {})).toEqual({ count: 1 });
      expect(
        mergeNotificationData('MESSAGE', { conversationId: 'a' }, { conversationId: 'b' }),
      ).toEqual({ conversationId: 'b' });
    });

    it('keeps at most 200 a member', () => {
      expect(notificationsOver(150)).toBe(0);
      expect(notificationsOver(200)).toBe(0);
      expect(notificationsOver(230)).toBe(30);
    });

    it('follows the favourite alerts’ caps whatever the channel', () => {
      const at = (minutes: number, spotId = 'spot') => ({
        spotId,
        channel: 'PUSH' as const,
        createdAt: new Date(NOW.getTime() - minutes * 60_000),
      });
      expect(alertAllowed('spot', [], NOW)).toBe(true);
      expect(alertAllowed('spot', [at(60)], NOW)).toBe(false);
      expect(alertAllowed('spot', [at(200)], NOW)).toBe(true);
      expect(
        alertAllowed(
          'spot',
          Array.from({ length: 10 }, (_, i) => at(i + 1, `other-${i}`)),
          NOW,
        ),
      ).toBe(false);
    });
  });
});
