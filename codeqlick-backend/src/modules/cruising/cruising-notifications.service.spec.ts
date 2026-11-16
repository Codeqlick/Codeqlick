import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { CruisingMediaRepository } from './cruising-media.repository.js';
import type { CruisingNotificationsRepository } from './cruising-notifications.repository.js';
import { CruisingNotificationsService } from './cruising-notifications.service.js';
import type { CruisingPushService } from './cruising-push.service.js';
import type { CruisingRepository } from './cruising.repository.js';
import { CruisingWinksService } from './cruising-winks.service.js';

const NOW = new Date('2026-11-16T12:00:00Z');
const VERSION = '2026-11-15.1';
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const THIRD = '33333333-3333-4333-8333-333333333333';
const SPOT = '44444444-4444-4444-8444-444444444444';

const profile = (over: Record<string, unknown> = {}) => ({
  userId: ME,
  termsVersion: VERSION,
  suspendedAt: null,
  suspendedUntil: null,
  nickname: 'me_myself',
  showVisits: false,
  ...over,
});

const person = (nickname: string | null, over: Record<string, unknown> = {}) => ({
  cruisingProfile: {
    nickname,
    suspendedAt: null,
    suspendedUntil: null,
    termsVersion: VERSION,
    ...over,
  },
});

function build() {
  const store = {
    unreadInGroup: vi.fn().mockResolvedValue([]),
    createNotifications: vi.fn().mockResolvedValue({ count: 0 }),
    refreshNotifications: vi.fn().mockResolvedValue({ count: 1 }),
    notifications: vi.fn().mockResolvedValue([]),
    markNotificationsRead: vi.fn().mockResolvedValue({ count: 0 }),
    markGroupRead: vi.fn().mockResolvedValue({ count: 0 }),
    deleteNotificationsOfKind: vi.fn().mockResolvedValue({ count: 0 }),
    deleteNotificationsBefore: vi.fn().mockResolvedValue(0),
    trimNotifications: vi.fn().mockResolvedValue(0),
    spotsByIds: vi.fn().mockResolvedValue([]),
    countWinksSince: vi.fn().mockResolvedValue(0),
    winkedSince: vi.fn().mockResolvedValue(false),
    createWink: vi.fn().mockResolvedValue({}),
    winksReceived: vi.fn().mockResolvedValue([]),
    winkedAt: vi.fn().mockResolvedValue(new Set()),
    deleteWinksBefore: vi.fn().mockResolvedValue(0),
    setShowVisits: vi.fn().mockResolvedValue({}),
    recordView: vi.fn().mockResolvedValue(true),
    visitors: vi.fn().mockResolvedValue([]),
    deleteViewsOf: vi.fn().mockResolvedValue({ count: 0 }),
    deleteViewsBefore: vi.fn().mockResolvedValue(0),
  };
  const repo = {
    findProfile: vi.fn().mockResolvedValue(profile()),
    findProfileByNickname: vi
      .fn()
      .mockResolvedValue(profile({ userId: OTHER, nickname: 'pier_fan' })),
    hiddenIds: vi.fn().mockResolvedValue([]),
    recipient: vi.fn().mockResolvedValue({ id: OTHER, locale: 'ES' }),
  };
  const config = { cruisingTermsVersion: VERSION };
  const mediaRepo = {
    badges: vi.fn().mockResolvedValue(new Map([[OTHER, { verified: true, coverId: null }]])),
  };
  const push = { enabled: true, notify: vi.fn().mockResolvedValue(1) };
  const notifications = new CruisingNotificationsService(
    store as unknown as CruisingNotificationsRepository,
    repo as unknown as CruisingRepository,
    config as unknown as AppConfigService,
  );
  const winks = new CruisingWinksService(
    store as unknown as CruisingNotificationsRepository,
    repo as unknown as CruisingRepository,
    mediaRepo as unknown as CruisingMediaRepository,
    notifications,
    push as unknown as CruisingPushService,
    config as unknown as AppConfigService,
  );
  return { notifications, winks, store, repo, push };
}

const on = (userId: string) => ({ userId, showVisits: true });
const status = (error: unknown) => (error as HttpException).getStatus();

describe('Cruising winks, visits and notifications', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => {
    t = build();
  });

  describe('the notification helper (decision 98)', () => {
    it('writes one notification per member, ids only', async () => {
      await t.notifications.notifyMany(
        [OTHER, THIRD, OTHER],
        'MEETUP_PLANNED',
        { spotId: SPOT },
        NOW,
      );
      expect(t.store.unreadInGroup).not.toHaveBeenCalled();
      expect(t.store.createNotifications).toHaveBeenCalledWith([
        {
          userId: OTHER,
          kind: 'MEETUP_PLANNED',
          data: { spotId: SPOT },
          groupKey: null,
          createdAt: NOW,
        },
        {
          userId: THIRD,
          kind: 'MEETUP_PLANNED',
          data: { spotId: SPOT },
          groupKey: null,
          createdAt: NOW,
        },
      ]);
    });

    it('keeps one unread notification per conversation, brought to the top', async () => {
      t.store.unreadInGroup.mockResolvedValue([
        { id: 'n1', userId: OTHER, data: { conversationId: 'c1' } },
      ]);
      await t.notifications.notifyMany([OTHER, THIRD], 'MESSAGE', { conversationId: 'c1' }, NOW);
      expect(t.store.unreadInGroup).toHaveBeenCalledWith([OTHER, THIRD], 'message:c1');
      expect(t.store.refreshNotifications).toHaveBeenCalledWith(
        ['n1'],
        { conversationId: 'c1' },
        NOW,
      );
      expect(t.store.createNotifications).toHaveBeenCalledWith([
        expect.objectContaining({ userId: THIRD, groupKey: 'message:c1' }),
      ]);
    });

    it('counts winks and visits in their unread notification', async () => {
      t.store.unreadInGroup.mockResolvedValue([{ id: 'n2', userId: OTHER, data: { count: 2 } }]);
      await t.notifications.notify(OTHER, 'VISITS', { count: 1 }, NOW);
      expect(t.store.unreadInGroup).toHaveBeenCalledWith([OTHER], 'visits:2026-11-16');
      expect(t.store.refreshNotifications).toHaveBeenCalledWith(['n2'], { count: 3 }, NOW);
    });

    it('never throws', async () => {
      t.store.createNotifications.mockRejectedValue(new Error('db down'));
      await expect(t.notifications.notify(OTHER, 'MEDIA_REMOVED')).resolves.toBeUndefined();
    });

    it('lists my notifications with the live spot they are about and the unread count', async () => {
      t.store.notifications.mockResolvedValue([
        { id: 'a', kind: 'SPOT_PUBLISHED', data: { spotId: SPOT }, readAt: null, createdAt: NOW },
        { id: 'b', kind: 'SPOT_REMOVED', data: { spotId: 'gone' }, readAt: NOW, createdAt: NOW },
      ]);
      t.store.spotsByIds.mockResolvedValue([
        { id: SPOT, slug: 'cove', name: 'Cove', status: 'LIVE' },
        { id: 'gone', slug: 'gone', name: 'Gone', status: 'REMOVED' },
      ]);
      expect(await t.notifications.list(ME, NOW)).toEqual({
        unread: 1,
        items: [
          {
            id: 'a',
            kind: 'SPOT_PUBLISHED',
            data: { spotId: SPOT },
            spot: { slug: 'cove', name: 'Cove' },
            read: false,
            at: NOW.toISOString(),
          },
          {
            id: 'b',
            kind: 'SPOT_REMOVED',
            data: { spotId: 'gone' },
            spot: null,
            read: true,
            at: NOW.toISOString(),
          },
        ],
      });
      expect(t.store.notifications).toHaveBeenCalledWith(
        ME,
        new Date(NOW.getTime() - 30 * 24 * 3600_000),
        200,
      );
    });

    it('marks some or all read, only for members who entered', async () => {
      await t.notifications.markRead(ME, ['a'], NOW);
      expect(t.store.markNotificationsRead).toHaveBeenCalledWith(ME, ['a'], NOW);
      await t.notifications.markRead(ME, undefined, NOW);
      expect(t.store.markNotificationsRead).toHaveBeenLastCalledWith(ME, undefined, NOW);
      t.repo.findProfile.mockResolvedValue(null);
      await expect(t.notifications.list(ME)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(t.notifications.markRead(ME, undefined)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('cleans up after 30 days and beyond 200 a member', async () => {
      await t.notifications.cleanup(NOW);
      const monthAgo = new Date(NOW.getTime() - 30 * 24 * 3600_000);
      expect(t.store.deleteNotificationsBefore).toHaveBeenCalledWith(monthAgo);
      expect(t.store.trimNotifications).toHaveBeenCalledWith(200);
      expect(t.store.deleteWinksBefore).toHaveBeenCalledWith(monthAgo);
      expect(t.store.deleteViewsBefore).toHaveBeenCalledWith(new Date('2026-10-17T00:00:00Z'));
    });
  });

  describe('winks (decision 97)', () => {
    it('winks, writes the centre and pushes "someone winked", nothing more', async () => {
      await t.winks.wink(ME, 'pier_fan', NOW);
      expect(t.store.createWink).toHaveBeenCalledWith(ME, OTHER, NOW);
      expect(t.store.createNotifications).toHaveBeenCalledWith([
        { userId: OTHER, kind: 'WINK', data: { count: 1 }, groupKey: 'wink', createdAt: NOW },
      ]);
      expect(t.push.notify).toHaveBeenCalledWith('wink', [{ userId: OTHER, locale: 'es' }]);
    });

    it('changes nothing on a second wink the same day', async () => {
      t.store.winkedSince.mockResolvedValue(true);
      await t.winks.wink(ME, 'pier_fan', NOW);
      expect(t.store.createWink).not.toHaveBeenCalled();
      expect(t.push.notify).not.toHaveBeenCalled();
    });

    it('stops at 30 a day', async () => {
      t.store.countWinksSince.mockResolvedValue(30);
      const error = await t.winks.wink(ME, 'pier_fan', NOW).catch((e: unknown) => e);
      expect(status(error)).toBe(429);
      expect(t.store.createWink).not.toHaveBeenCalled();
    });

    it('needs a nickname, a visible member and someone else', async () => {
      t.repo.findProfile.mockResolvedValue(profile({ nickname: null }));
      await expect(t.winks.wink(ME, 'pier_fan', NOW)).rejects.toBeInstanceOf(ConflictException);
      t.repo.findProfile.mockResolvedValue(profile({ suspendedAt: NOW }));
      await expect(t.winks.wink(ME, 'pier_fan', NOW)).rejects.toBeInstanceOf(ForbiddenException);
      t.repo.findProfile.mockResolvedValue(profile());
      t.repo.hiddenIds.mockResolvedValue([OTHER]);
      await expect(t.winks.wink(ME, 'pier_fan', NOW)).rejects.toBeInstanceOf(NotFoundException);
      t.repo.hiddenIds.mockResolvedValue([]);
      t.repo.findProfileByNickname.mockResolvedValue(profile({ userId: OTHER, suspendedAt: NOW }));
      await expect(t.winks.wink(ME, 'pier_fan', NOW)).rejects.toBeInstanceOf(NotFoundException);
      t.repo.findProfileByNickname.mockResolvedValue(profile());
      await expect(t.winks.wink(ME, 'me_myself', NOW)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lists the latest wink of each visible member, and whether I winked back', async () => {
      t.store.winksReceived.mockResolvedValue([
        { senderId: OTHER, createdAt: NOW, sender: person('pier_fan') },
        { senderId: OTHER, createdAt: new Date(NOW.getTime() - 1000), sender: person('pier_fan') },
        { senderId: THIRD, createdAt: NOW, sender: person('gone', { suspendedAt: NOW }) },
      ]);
      t.store.winkedAt.mockResolvedValue(new Set([OTHER]));
      t.repo.hiddenIds.mockResolvedValue(['blocked']);
      expect(await t.winks.winks(ME, NOW)).toEqual({
        items: [{ nickname: 'pier_fan', verified: true, at: NOW.toISOString(), mutual: true }],
      });
      expect(t.store.winksReceived).toHaveBeenCalledWith(ME, expect.any(Date), ['blocked'], 500);
    });
  });

  describe('profile visits (decision 97)', () => {
    it('records a visit only when both turned visits on, and tells the day’s count', async () => {
      await t.winks.recordVisit({ userId: ME, showVisits: false }, on(OTHER), NOW);
      await t.winks.recordVisit(on(ME), { userId: OTHER, showVisits: false }, NOW);
      expect(t.store.recordView).not.toHaveBeenCalled();
      await t.winks.recordVisit(on(ME), on(OTHER), NOW);
      expect(t.store.recordView).toHaveBeenCalledWith(ME, OTHER, new Date('2026-11-16'), NOW);
      expect(t.store.createNotifications).toHaveBeenCalledWith([
        expect.objectContaining({ userId: OTHER, kind: 'VISITS', data: { count: 1 } }),
      ]);
    });

    it('tells nothing on a second visit the same day', async () => {
      t.store.recordView.mockResolvedValue(false);
      await t.winks.recordVisit(on(ME), on(OTHER), NOW);
      expect(t.store.createNotifications).not.toHaveBeenCalled();
    });

    it('shows visitors only with visits on, the latest visit of each', async () => {
      expect(await t.winks.visitors(ME, NOW)).toEqual({ showVisits: false, items: [] });
      expect(t.store.visitors).not.toHaveBeenCalled();
      t.repo.findProfile.mockResolvedValue(profile({ showVisits: true }));
      t.store.visitors.mockResolvedValue([
        { viewerId: OTHER, seenAt: NOW, viewer: person('pier_fan') },
        { viewerId: OTHER, seenAt: new Date('2026-11-15'), viewer: person('pier_fan') },
        { viewerId: THIRD, seenAt: NOW, viewer: person(null) },
      ]);
      expect(await t.winks.visitors(ME, NOW)).toEqual({
        showVisits: true,
        items: [{ nickname: 'pier_fan', verified: true, at: NOW.toISOString() }],
      });
    });

    it('turning visits off deletes them both ways', async () => {
      expect(await t.winks.setShowVisits(ME, true)).toEqual({ showVisits: true });
      expect(t.store.deleteViewsOf).not.toHaveBeenCalled();
      expect(await t.winks.setShowVisits(ME, false)).toEqual({ showVisits: false });
      expect(t.store.setShowVisits).toHaveBeenLastCalledWith(ME, false);
      expect(t.store.deleteViewsOf).toHaveBeenCalledWith(ME);
      expect(t.store.deleteNotificationsOfKind).toHaveBeenCalledWith(ME, 'VISITS');
    });
  });
});
