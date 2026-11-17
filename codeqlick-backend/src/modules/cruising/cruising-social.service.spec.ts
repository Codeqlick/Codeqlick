import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { MailMessage, MailService } from '../mail/mail.service.js';
import type { CruisingMediaRepository } from './cruising-media.repository.js';
import type { CruisingNotificationsService } from './cruising-notifications.service.js';
import type { CruisingPushService } from './cruising-push.service.js';
import type { AdultSafetyService } from '../adult/adult-safety.service.js';
import type { CruisingWinksService } from './cruising-winks.service.js';
import type { CruisingRepository } from './cruising.repository.js';
import { CruisingSocialService } from './cruising-social.service.js';

const NOW = new Date('2026-11-15T12:00:00Z');
const VERSION = '2026-11-15.1';
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SPOT = '33333333-3333-4333-8333-333333333333';
const CONVERSATION = '55555555-5555-4555-8555-555555555555';
const BOX = { minLng: -3.75, minLat: 40.25, maxLng: -3.5, maxLat: 40.5 };
const SECRET_NAME = 'Secret Cove Of Dreams';
const SECRET_NICKNAME = 'pier_fan';
const SECRET_TEXT = 'meet me at the cove';

const profile = (over: Record<string, unknown> = {}) => ({
  userId: ME,
  birthYear: 1990,
  termsVersion: VERSION,
  acceptedAt: NOW,
  emailAlerts: true,
  suspendedAt: null,
  suspendedUntil: null,
  suspensionReason: null,
  nickname: 'me_myself',
  bio: 'Quiet evenings',
  country: 'ES',
  lookingFor: ['CHAT'],
  showAge: true,
  createdAt: new Date('2026-01-02T03:04:05Z'),
  ...over,
});

const other = (over: Record<string, unknown> = {}) =>
  profile({ userId: OTHER, nickname: SECRET_NICKNAME, birthYear: 1985, ...over });

const conversation = (over: Record<string, unknown> = {}) => ({
  id: CONVERSATION,
  userAId: ME,
  userBId: OTHER,
  starterId: ME,
  lastMessageAt: null,
  readAAt: null,
  readBAt: null,
  notifiedAAt: null,
  notifiedBAt: null,
  createdAt: NOW,
  ...over,
});

function build() {
  const repo = {
    findProfile: vi.fn().mockResolvedValue(profile()),
    findProfileByNickname: vi.fn().mockResolvedValue(other()),
    hiddenIds: vi.fn().mockResolvedValue([]),
    liveReviewsBy: vi.fn().mockResolvedValue([]),
    liveSpotsBy: vi.fn().mockResolvedValue([]),
    findSpot: vi.fn().mockResolvedValue({
      id: SPOT,
      slug: 'cove',
      name: SECRET_NAME,
      status: 'LIVE',
      lat: 40.4,
      lng: -3.7,
      timeZone: 'Europe/Madrid',
    }),
    countCheckInsSince: vi.fn().mockResolvedValue(0),
    createCheckIn: vi.fn().mockImplementation((_user, _spot, anonymous: boolean, expiresAt: Date) =>
      Promise.resolve({
        anonymous,
        expiresAt,
        spot: { id: SPOT, slug: 'cove', name: SECRET_NAME },
      }),
    ),
    activeCheckIn: vi.fn().mockResolvedValue(null),
    endCheckIns: vi.fn().mockResolvedValue(undefined),
    presence: vi.fn().mockResolvedValue([]),
    activeInBox: vi.fn().mockResolvedValue([]),
    deleteCheckInsExpiredBefore: vi.fn().mockResolvedValue(3),
    deleteConversationStartsBefore: vi.fn().mockResolvedValue(0),
    deleteNicknameChangesBefore: vi.fn().mockResolvedValue(0),
    deleteAlertsBefore: vi.fn().mockResolvedValue(0),
    decaySpotHours: vi.fn().mockResolvedValue(0),
    favorites: vi.fn().mockResolvedValue([]),
    hereAt: vi.fn().mockResolvedValue(new Map()),
    isFavorite: vi.fn().mockResolvedValue(false),
    countFavorites: vi.fn().mockResolvedValue(0),
    addFavorite: vi.fn().mockResolvedValue(undefined),
    removeFavorite: vi.fn().mockResolvedValue(undefined),
    favoriteAlertCandidates: vi.fn().mockResolvedValue([]),
    recentAlerts: vi.fn().mockResolvedValue([]),
    createAlerts: vi.fn().mockResolvedValue(undefined),
    savePushSubscription: vi.fn().mockResolvedValue(undefined),
    deletePushSubscription: vi.fn().mockResolvedValue(undefined),
    findConversation: vi.fn().mockResolvedValue(conversation()),
    findConversationBetween: vi.fn().mockResolvedValue(null),
    createConversation: vi.fn().mockResolvedValue({ id: CONVERSATION }),
    countConversationsStartedSince: vi.fn().mockResolvedValue(0),
    conversationsOf: vi.fn().mockResolvedValue([]),
    countMessagesFrom: vi.fn().mockResolvedValue(0),
    messages: vi.fn().mockResolvedValue([]),
    markRead: vi.fn().mockResolvedValue(undefined),
    messageCounts: vi.fn().mockResolvedValue(new Map()),
    addMessage: vi
      .fn()
      .mockImplementation((_conversation, _sender, text: string, now: Date) =>
        Promise.resolve({ id: 'message-1', text, createdAt: now }),
      ),
    deleteConversation: vi.fn().mockResolvedValue(undefined),
    recentlyActiveConversations: vi.fn().mockResolvedValue([]),
    markNotified: vi.fn().mockResolvedValue(undefined),
    recipient: vi.fn().mockResolvedValue({
      id: ME,
      email: 'reader@example.com',
      locale: 'ES',
      cruisingProfile: { emailAlerts: true, suspendedAt: null, suspendedUntil: null },
    }),
  };
  const sent: MailMessage[] = [];
  const mail = {
    send: vi.fn().mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    }),
  };
  const config = {
    isTest: true,
    cruisingTermsVersion: VERSION,
    siteUrl: 'https://codeqlick.com',
    siteUrlFor: (realm: string) =>
      realm === 'NEOQLICK' ? 'https://neoqlick.com' : 'https://codeqlick.com',
    accountUrlFor: (realm: string) =>
      realm === 'NEOQLICK' ? 'https://account.neoqlick.com' : 'https://account.codeqlick.com',
    webappUrl: () => 'https://cruising.codeqlick.com',
  };
  const mediaRepo = { badges: vi.fn().mockResolvedValue(new Map()) };
  const push = { enabled: true, notify: vi.fn().mockResolvedValue(1) };
  const notifications = {
    notify: vi.fn().mockResolvedValue(undefined),
    notifyMany: vi.fn().mockResolvedValue(undefined),
    readConversation: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
  };
  const winks = {
    recordVisit: vi.fn().mockResolvedValue(undefined),
    winkedToday: vi.fn().mockResolvedValue(false),
  };
  // The shared safety of the 18+ apps (architecture 4.16).
  const safety = {
    block: vi.fn().mockResolvedValue(undefined),
    unblock: vi.fn().mockResolvedValue(true),
    blocks: vi.fn().mockResolvedValue({ items: [] }),
  };
  const service = new CruisingSocialService(
    repo as unknown as CruisingRepository,
    mediaRepo as unknown as CruisingMediaRepository,
    mail as unknown as MailService,
    config as unknown as AppConfigService,
    push as unknown as CruisingPushService,
    notifications as unknown as CruisingNotificationsService,
    winks as unknown as CruisingWinksService,
    safety as unknown as AdultSafetyService,
  );
  return { service, repo, sent, push, notifications, winks, safety };
}

const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
const status = (error: unknown) => (error as HttpException).getStatus();

describe('CruisingSocialService', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => {
    t = build();
  });

  describe('who may do what', () => {
    it('needs entry for everything', async () => {
      t.repo.findProfile.mockResolvedValue(null);
      const calls = [
        () => t.service.member(ME, 'x'),
        () => t.service.myCheckIn(ME),
        () => t.service.checkIn(ME, { spotId: SPOT, hours: 1, anonymous: false }),
        () => t.service.endCheckIn(ME),
        () => t.service.presence(ME, SPOT),
        () => t.service.active(ME, BOX),
        () => t.service.conversations(ME),
        () => t.service.openConversation(ME, 'x'),
        () => t.service.messages(ME, CONVERSATION, undefined),
        () => t.service.sendMessage(ME, CONVERSATION, 'hi'),
        () => t.service.deleteConversation(ME, CONVERSATION),
        () => t.service.blocks(ME),
        () => t.service.block(ME, 'x'),
        () => t.service.blockConversation(ME, CONVERSATION),
        () => t.service.unblock(ME, 'x'),
      ];
      for (const call of calls) await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('asks again when the rules changed', async () => {
      t.repo.findProfile.mockResolvedValue(profile({ termsVersion: 'old' }));
      await expect(t.service.presence(ME, SPOT)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('lets a suspended member read and leave, but not check in or write', async () => {
      t.repo.findProfile.mockResolvedValue(profile({ suspendedAt: NOW }));
      await expect(
        t.service.checkIn(ME, { spotId: SPOT, hours: 1, anonymous: false }, NOW),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(t.service.sendMessage(ME, CONVERSATION, 'hi', NOW)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(t.service.openConversation(ME, SECRET_NICKNAME, NOW)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(t.service.conversations(ME)).resolves.toEqual([]);
      await expect(t.service.presence(ME, SPOT, NOW)).resolves.toEqual({ count: 0, members: [] });
      await t.service.deleteConversation(ME, CONVERSATION);
      expect(t.repo.deleteConversation).toHaveBeenCalledWith(CONVERSATION);
    });

    it('needs a nickname to check in, message and look at profiles', async () => {
      t.repo.findProfile.mockResolvedValue(profile({ nickname: null }));
      await expect(
        t.service.checkIn(ME, { spotId: SPOT, hours: 1, anonymous: false }, NOW),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(t.service.openConversation(ME, SECRET_NICKNAME, NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(t.service.sendMessage(ME, CONVERSATION, 'hi', NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
      await expect(t.service.member(ME, SECRET_NICKNAME, NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(t.repo.createCheckIn).not.toHaveBeenCalled();
    });
  });

  describe('profiles', () => {
    it('shows the age as the current year minus the year of birth', async () => {
      expect(await t.service.member(ME, SECRET_NICKNAME, NOW)).toEqual({
        nickname: SECRET_NICKNAME,
        bio: 'Quiet evenings',
        country: 'ES',
        lookingFor: ['CHAT'],
        age: 41,
        memberSince: '2026-01-02T03:04:05.000Z',
        verified: false,
        coverId: null,
        health: null,
        badges: [],
        contributions: { spotsLive: 0, helpfulReceived: 0, reviewsWritten: 0 },
        winked: false,
      });
    });

    it('records the visit and says whether I winked today (decision 97)', async () => {
      t.winks.winkedToday.mockResolvedValue(true);
      expect((await t.service.member(ME, SECRET_NICKNAME, NOW)).winked).toBe(true);
      expect(t.winks.recordVisit).toHaveBeenCalledWith(
        expect.objectContaining({ userId: ME }),
        expect.objectContaining({ userId: OTHER }),
        NOW,
      );
    });

    it('records no visit of a blocked member, who stays hidden', async () => {
      t.repo.hiddenIds.mockResolvedValue([OTHER]);
      await expect(t.service.member(ME, SECRET_NICKNAME, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(t.winks.recordVisit).not.toHaveBeenCalled();
    });

    it('shows sexual health only when it is on and the member shows it (decision 94)', async () => {
      const health = {
        healthConsentAt: NOW,
        prepStatus: 'ON_PREP',
        lastTestedMonth: '2026-09',
        healthVisible: false,
      };
      t.repo.findProfileByNickname.mockResolvedValue(other(health));
      expect((await t.service.member(ME, SECRET_NICKNAME, NOW)).health).toBeNull();
      t.repo.findProfileByNickname.mockResolvedValue(other({ ...health, healthVisible: true }));
      expect((await t.service.member(ME, SECRET_NICKNAME, NOW)).health).toEqual({
        prepStatus: 'ON_PREP',
        lastTestedMonth: '2026-09',
      });
    });

    it('shows the contributor badges its counters earn (decision 93)', async () => {
      t.repo.findProfileByNickname.mockResolvedValue(
        other({ spotsLive: 4, helpfulReceived: 10, reviewsWritten: 24 }),
      );
      const member = await t.service.member(ME, SECRET_NICKNAME, NOW);
      expect(member.badges).toEqual(['EXPLORER', 'HELPFUL']);
      expect(member.contributions).toEqual({
        spotsLive: 4,
        helpfulReceived: 10,
        reviewsWritten: 24,
      });
    });

    it('hides the age unless the member shows it', async () => {
      t.repo.findProfileByNickname.mockResolvedValue(other({ showAge: false }));
      expect((await t.service.member(ME, SECRET_NICKNAME, NOW)).age).toBeNull();
    });

    it('answers 404 for an unknown, suspended or blocked member', async () => {
      t.repo.findProfileByNickname.mockResolvedValue(null);
      await expect(t.service.member(ME, 'nobody', NOW)).rejects.toBeInstanceOf(NotFoundException);
      t.repo.findProfileByNickname.mockResolvedValue(other({ suspendedAt: NOW }));
      await expect(t.service.member(ME, SECRET_NICKNAME, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      t.repo.findProfileByNickname.mockResolvedValue(other());
      t.repo.hiddenIds.mockResolvedValue([OTHER]);
      await expect(t.service.member(ME, SECRET_NICKNAME, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('shows a member whose suspension ended', async () => {
      t.repo.findProfileByNickname.mockResolvedValue(
        other({
          suspendedAt: new Date('2026-11-01T00:00:00Z'),
          suspendedUntil: new Date('2026-11-02T00:00:00Z'),
        }),
      );
      await expect(t.service.member(ME, SECRET_NICKNAME, NOW)).resolves.toMatchObject({
        nickname: SECRET_NICKNAME,
      });
    });

    it('shows me my own profile', async () => {
      t.repo.findProfileByNickname.mockResolvedValue(profile());
      await expect(t.service.member(ME, 'me_myself', NOW)).resolves.toMatchObject({
        nickname: 'me_myself',
      });
    });
  });

  describe("a profile's reviews and spots", () => {
    it('lists the LIVE reviews and spots of the member', async () => {
      t.repo.liveReviewsBy.mockResolvedValue([
        {
          id: 'review-1',
          rating: 4,
          text: 'Nice',
          createdAt: NOW,
          spot: { slug: 'cove', name: SECRET_NAME, city: 'Madrid', countryCode: 'ES' },
          _count: { votes: 3 },
        },
      ]);
      t.repo.liveSpotsBy.mockResolvedValue([
        {
          id: SPOT,
          slug: 'cove',
          name: SECRET_NAME,
          type: 'PARK',
          lat: '40.40000',
          lng: '-3.70000',
          ratingAvg: '4.50',
          ratingCount: 2,
          city: 'Madrid',
          countryCode: 'ES',
        },
      ]);
      const activity = await t.service.activity(ME, SECRET_NICKNAME, NOW);
      expect(t.repo.liveReviewsBy).toHaveBeenCalledWith(OTHER, 20);
      expect(t.repo.liveSpotsBy).toHaveBeenCalledWith(OTHER, 20);
      expect(activity).toEqual({
        reviews: [
          {
            id: 'review-1',
            rating: 4,
            text: 'Nice',
            createdAt: NOW.toISOString(),
            helpful: 3,
            spot: { slug: 'cove', name: SECRET_NAME, city: 'Madrid', countryCode: 'ES' },
          },
        ],
        spots: [
          {
            id: SPOT,
            slug: 'cove',
            name: SECRET_NAME,
            type: 'PARK',
            lat: 40.4,
            lng: -3.7,
            ratingAvg: 4.5,
            ratingCount: 2,
            city: 'Madrid',
            countryCode: 'ES',
          },
        ],
      });
    });

    it('answers 404 like the profile, and needs my nickname', async () => {
      t.repo.hiddenIds.mockResolvedValue([OTHER]);
      await expect(t.service.activity(ME, SECRET_NICKNAME, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      t.repo.findProfile.mockResolvedValue(profile({ nickname: null }));
      await expect(t.service.activity(ME, SECRET_NICKNAME, NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(t.repo.liveReviewsBy).not.toHaveBeenCalled();
    });
  });

  describe('check-ins', () => {
    it('create one for 1 to 3 hours at a LIVE spot, ending the previous', async () => {
      const view = await t.service.checkIn(ME, { spotId: SPOT, hours: 2, anonymous: true }, NOW);
      expect(t.repo.createCheckIn).toHaveBeenCalledWith(
        ME,
        SPOT,
        true,
        new Date(NOW.getTime() + 2 * 3600_000),
        NOW,
        // Sunday 13:00 in Madrid: the busiest hours count 13 and 14 o'clock (decision 89).
        {
          timeZone: 'Europe/Madrid',
          slots: [
            { day: 6, hour: 13 },
            { day: 6, hour: 14 },
          ],
        },
      );
      expect(view).toEqual({
        spot: { id: SPOT, slug: 'cove', name: SECRET_NAME },
        anonymous: true,
        expiresAt: new Date(NOW.getTime() + 2 * 3600_000).toISOString(),
      });
    });

    it('answer 404 unless the spot is LIVE', async () => {
      for (const found of [null, { id: SPOT, status: 'HIDDEN' }, { id: SPOT, status: 'PENDING' }]) {
        t.repo.findSpot.mockResolvedValue(found);
        await expect(
          t.service.checkIn(ME, { spotId: SPOT, hours: 1, anonymous: false }, NOW),
        ).rejects.toBeInstanceOf(NotFoundException);
      }
      expect(t.repo.createCheckIn).not.toHaveBeenCalled();
    });

    it('allow 10 a day and refuse the eleventh with 429', async () => {
      t.repo.countCheckInsSince.mockResolvedValue(9);
      await expect(
        t.service.checkIn(ME, { spotId: SPOT, hours: 1, anonymous: false }, NOW),
      ).resolves.toBeDefined();
      t.repo.countCheckInsSince.mockResolvedValue(10);
      const error = await t.service
        .checkIn(ME, { spotId: SPOT, hours: 1, anonymous: false }, NOW)
        .catch((e: unknown) => e);
      expect(status(error)).toBe(429);
      expect(t.repo.countCheckInsSince).toHaveBeenLastCalledWith(
        ME,
        new Date(NOW.getTime() - 24 * 3600_000),
      );
    });

    it('show my active check-in, or null', async () => {
      expect(await t.service.myCheckIn(ME, NOW)).toBeNull();
      t.repo.activeCheckIn.mockResolvedValue({
        anonymous: false,
        expiresAt: new Date(NOW.getTime() + 3600_000),
        spot: { id: SPOT, slug: 'cove', name: SECRET_NAME },
      });
      expect(await t.service.myCheckIn(ME, NOW)).toMatchObject({
        spot: { slug: 'cove' },
        anonymous: false,
      });
    });

    it('end at once, even without one', async () => {
      await t.service.endCheckIn(ME, NOW);
      expect(t.repo.endCheckIns).toHaveBeenCalledWith(ME, NOW);
    });

    it('count everybody here but name only the non-anonymous', async () => {
      const row = (id: string, anonymous: boolean, nickname: string | null) => ({
        id,
        anonymous,
        createdAt: NOW,
        user: { cruisingProfile: { nickname } },
      });
      t.repo.hiddenIds.mockResolvedValue(['blocked']);
      t.repo.presence.mockResolvedValue([
        row('1', false, SECRET_NICKNAME),
        row('2', true, 'shy_guy'),
        row('3', false, 'me_myself'),
      ]);
      const presence = await t.service.presence(ME, SPOT, NOW);
      expect(t.repo.presence).toHaveBeenCalledWith(SPOT, NOW, ['blocked']);
      expect(presence).toEqual({
        count: 3,
        members: [
          { nickname: SECRET_NICKNAME, since: NOW.toISOString(), verified: false, coverId: null },
          { nickname: 'me_myself', since: NOW.toISOString(), verified: false, coverId: null },
        ],
      });
      expect(JSON.stringify(presence)).not.toContain('shy_guy');
    });

    it('show the active spots of a box without the people hidden from me', async () => {
      t.repo.hiddenIds.mockResolvedValue(['blocked']);
      t.repo.activeInBox.mockResolvedValue([{ spotId: SPOT, here: 2 }]);
      await expect(t.service.active(ME, BOX, NOW)).resolves.toEqual({
        items: [{ spotId: SPOT, here: 2 }],
      });
      expect(t.repo.activeInBox).toHaveBeenCalledWith(BOX, NOW, ['blocked'], 500);
    });

    it('show the active spots to a suspended member too (reading is allowed)', async () => {
      t.repo.findProfile.mockResolvedValue(profile({ suspendedAt: NOW }));
      await expect(t.service.active(ME, BOX, NOW)).resolves.toEqual({ items: [] });
    });

    it('answer 404 for presence at a spot that is not LIVE', async () => {
      t.repo.findSpot.mockResolvedValue({ id: SPOT, status: 'HIDDEN' });
      await expect(t.service.presence(ME, SPOT, NOW)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('are deleted once expired for more than 24 hours', async () => {
      expect(await t.service.cleanupCheckIns(NOW)).toBe(3);
      expect(t.repo.deleteCheckInsExpiredBefore).toHaveBeenCalledWith(
        new Date(NOW.getTime() - 24 * 3600_000),
      );
      // Favourite alerts are kept two days.
      expect(t.repo.deleteAlertsBefore).toHaveBeenCalledWith(
        new Date(NOW.getTime() - 48 * 3600_000),
      );
      // The busiest hours fade once a day (decision 89).
      expect(t.repo.decaySpotHours).toHaveBeenCalledWith(
        new Date(NOW.getTime() - 24 * 3600_000),
        0.98,
      );
      t.repo.deleteCheckInsExpiredBefore.mockRejectedValue(new Error('db down'));
      expect(await t.service.cleanupCheckIns(NOW)).toBe(0);
    });
  });

  describe('opening conversations', () => {
    it('creates one and says so', async () => {
      expect(await t.service.openConversation(ME, SECRET_NICKNAME, NOW)).toEqual({
        id: CONVERSATION,
        created: true,
      });
      expect(t.repo.createConversation).toHaveBeenCalledWith(ME, OTHER);
    });

    it('returns the existing one without counting it', async () => {
      t.repo.findConversationBetween.mockResolvedValue(conversation());
      t.repo.countConversationsStartedSince.mockResolvedValue(10);
      expect(await t.service.openConversation(ME, SECRET_NICKNAME, NOW)).toEqual({
        id: CONVERSATION,
        created: false,
      });
      expect(t.repo.createConversation).not.toHaveBeenCalled();
    });

    it('allows 10 new a day and refuses the eleventh with 429', async () => {
      t.repo.countConversationsStartedSince.mockResolvedValue(10);
      const error = await t.service
        .openConversation(ME, SECRET_NICKNAME, NOW)
        .catch((e: unknown) => e);
      expect(status(error)).toBe(429);
      expect(t.repo.countConversationsStartedSince).toHaveBeenCalledWith(
        ME,
        new Date(NOW.getTime() - 24 * 3600_000),
      );
    });

    it('answers 404 for an unknown, blocked or suspended person, and 400 for myself', async () => {
      t.repo.findProfileByNickname.mockResolvedValue(null);
      await expect(t.service.openConversation(ME, 'nobody', NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      t.repo.findProfileByNickname.mockResolvedValue(other());
      t.repo.hiddenIds.mockResolvedValue([OTHER]);
      await expect(t.service.openConversation(ME, SECRET_NICKNAME, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      t.repo.hiddenIds.mockResolvedValue([]);
      t.repo.findProfileByNickname.mockResolvedValue(other({ suspendedAt: NOW }));
      await expect(t.service.openConversation(ME, SECRET_NICKNAME, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      t.repo.findProfileByNickname.mockResolvedValue(profile());
      await expect(t.service.openConversation(ME, 'me_myself', NOW)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(t.repo.createConversation).not.toHaveBeenCalled();
    });

    it('returns the conversation the other person opened at the same moment', async () => {
      t.repo.createConversation.mockRejectedValue(Object.assign(new Error('x'), { code: 'P2002' }));
      t.repo.findConversationBetween
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(conversation());
      expect(await t.service.openConversation(ME, SECRET_NICKNAME, NOW)).toEqual({
        id: CONVERSATION,
        created: false,
      });
    });

    it('lets other errors through', async () => {
      t.repo.createConversation.mockRejectedValue(new Error('db down'));
      await expect(t.service.openConversation(ME, SECRET_NICKNAME, NOW)).rejects.toThrow('db down');
    });
  });

  describe('the list of conversations', () => {
    it('shows the partner, the last message and the unread count, from either side', async () => {
      const at = new Date(NOW.getTime() - 60_000);
      t.repo.conversationsOf.mockResolvedValue([
        {
          ...conversation({ readAAt: at }),
          userA: { cruisingProfile: { nickname: 'me_myself' } },
          userB: { cruisingProfile: { nickname: SECRET_NICKNAME } },
          messages: [{ text: 'Hi', senderId: OTHER, createdAt: NOW }],
        },
        {
          ...conversation({ id: 'second', userAId: OTHER, userBId: ME }),
          userA: { cruisingProfile: { nickname: 'third_one' } },
          userB: { cruisingProfile: { nickname: 'me_myself' } },
          messages: [],
        },
      ]);
      t.repo.countMessagesFrom.mockResolvedValueOnce(2).mockResolvedValueOnce(0);
      const items = await t.service.conversations(ME);
      expect(t.repo.countMessagesFrom).toHaveBeenNthCalledWith(1, CONVERSATION, OTHER, at);
      expect(items).toEqual([
        {
          id: CONVERSATION,
          partner: { nickname: SECRET_NICKNAME, verified: false, coverId: null },
          lastMessage: { text: 'Hi', mine: false, at: NOW.toISOString() },
          unread: 2,
          createdAt: NOW.toISOString(),
        },
        {
          id: 'second',
          partner: { nickname: 'third_one', verified: false, coverId: null },
          lastMessage: null,
          unread: 0,
          createdAt: NOW.toISOString(),
        },
      ]);
    });
  });

  describe('messages', () => {
    it('answer 404 for a conversation that is not mine', async () => {
      t.repo.findConversation.mockResolvedValue(conversation({ userAId: '8', userBId: '9' }));
      await expect(t.service.messages(ME, CONVERSATION, undefined, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(t.service.sendMessage(ME, CONVERSATION, 'hi', NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(t.service.deleteConversation(ME, CONVERSATION)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(t.service.blockConversation(ME, CONVERSATION)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      t.repo.findConversation.mockResolvedValue(null);
      await expect(t.service.messages(ME, CONVERSATION, undefined, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(t.repo.markRead).not.toHaveBeenCalled();
    });

    it('are listed with who sent them and marked read', async () => {
      t.repo.messages.mockResolvedValue([
        { id: 'm1', senderId: OTHER, text: 'Hi', createdAt: NOW },
        { id: 'm2', senderId: ME, text: 'Hello', createdAt: new Date(NOW.getTime() + 1000) },
      ]);
      const items = await t.service.messages(ME, CONVERSATION, undefined, NOW);
      expect(t.repo.messages).toHaveBeenCalledWith(CONVERSATION, undefined);
      expect(items.map((item) => item.mine)).toEqual([false, true]);
      expect(t.repo.markRead).toHaveBeenCalledWith(conversation(), ME, NOW);
    });

    it('can be asked for after a moment', async () => {
      await t.service.messages(ME, CONVERSATION, '2026-11-15T11:59:00.000Z', NOW);
      expect(t.repo.messages).toHaveBeenCalledWith(
        CONVERSATION,
        new Date('2026-11-15T11:59:00.000Z'),
      );
    });

    it('are sent as mine', async () => {
      expect(await t.service.sendMessage(ME, CONVERSATION, 'Hello there', NOW)).toEqual({
        id: 'message-1',
        mine: true,
        text: 'Hello there',
        createdAt: NOW.toISOString(),
      });
      expect(t.repo.addMessage).toHaveBeenCalledWith(conversation(), ME, 'Hello there', NOW);
    });

    it.each([
      'call me +34 612 345 678',
      'write to me at john@example.com',
      'see https://example.com',
      'add me on telegram',
      'follow @someone_else',
    ])('refuse contact details until each side sent 5: %s', async (text) => {
      t.repo.messageCounts.mockResolvedValue(
        new Map([
          [ME, 5],
          [OTHER, 4],
        ]),
      );
      await expect(t.service.sendMessage(ME, CONVERSATION, text, NOW)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      t.repo.messageCounts.mockResolvedValue(
        new Map([
          [ME, 4],
          [OTHER, 5],
        ]),
      );
      await expect(t.service.sendMessage(ME, CONVERSATION, text, NOW)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(t.repo.addMessage).not.toHaveBeenCalled();
    });

    it('allow contact details once each side sent 5', async () => {
      t.repo.messageCounts.mockResolvedValue(
        new Map([
          [ME, 5],
          [OTHER, 5],
        ]),
      );
      await t.service.sendMessage(ME, CONVERSATION, 'my number is 612 345 678', NOW);
      expect(t.repo.addMessage).toHaveBeenCalledOnce();
    });

    it('do not even count the messages of an ordinary text', async () => {
      await t.service.sendMessage(ME, CONVERSATION, 'see you there at nine', NOW);
      expect(t.repo.messageCounts).not.toHaveBeenCalled();
    });
  });

  describe('leaving and blocking', () => {
    it('deleting a conversation deletes it for both', async () => {
      await t.service.deleteConversation(ME, CONVERSATION);
      expect(t.repo.deleteConversation).toHaveBeenCalledWith(CONVERSATION);
    });

    it('blocking from a conversation blocks the other person', async () => {
      t.repo.findConversation.mockResolvedValue(conversation({ userAId: OTHER, userBId: ME }));
      await t.service.blockConversation(ME, CONVERSATION);
      expect(t.safety.block).toHaveBeenCalledWith(ME, OTHER, 'CRUISING');
    });

    it('blocks a person by nickname', async () => {
      await t.service.block(ME, SECRET_NICKNAME);
      expect(t.safety.block).toHaveBeenCalledWith(ME, OTHER, 'CRUISING');
    });

    it('does not block an unknown person or myself', async () => {
      t.repo.findProfileByNickname.mockResolvedValue(null);
      await expect(t.service.block(ME, 'nobody')).rejects.toBeInstanceOf(NotFoundException);
      t.repo.findProfileByNickname.mockResolvedValue(profile());
      await expect(t.service.block(ME, 'me_myself')).rejects.toBeInstanceOf(BadRequestException);
      expect(t.safety.block).not.toHaveBeenCalled();
    });

    it('lists my blocks by nickname (people without one in Cruising left out)', async () => {
      t.safety.blocks.mockResolvedValue({
        items: [
          { ref: 'a', name: SECRET_NICKNAME, sourceApp: 'SWIPE', createdAt: NOW.toISOString() },
          { ref: 'b', name: null, sourceApp: 'VIDEOCHAT', createdAt: NOW.toISOString() },
        ],
      });
      expect(await t.service.blocks(ME)).toEqual({
        items: [{ nickname: SECRET_NICKNAME, createdAt: NOW.toISOString() }],
      });
    });

    it('lifts a block, and answers 404 when there was none', async () => {
      await t.service.unblock(ME, SECRET_NICKNAME);
      expect(t.safety.unblock).toHaveBeenCalledWith(ME, OTHER);
      t.safety.unblock.mockResolvedValue(false);
      await expect(t.service.unblock(ME, SECRET_NICKNAME)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      t.repo.findProfileByNickname.mockResolvedValue(null);
      await expect(t.service.unblock(ME, 'nobody')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('the unread-message email', () => {
    const MINUTE = 60_000;
    /** A conversation whose last message (from OTHER, to me as A) is 20 minutes old. */
    const waiting = (over: Record<string, unknown> = {}) =>
      conversation({
        lastMessageAt: new Date(NOW.getTime() - 20 * MINUTE),
        messages: [{ senderId: OTHER }],
        ...over,
      });

    it('asks only for conversations active in the last week and quiet for 15 minutes', async () => {
      await t.service.emailUnread(NOW);
      expect(t.repo.recentlyActiveConversations).toHaveBeenCalledWith(
        new Date(NOW.getTime() - 7 * 24 * 3600_000),
        new Date(NOW.getTime() - 15 * MINUTE),
        undefined,
        500,
      );
    });

    it('pages through every candidate, not just the first 500', async () => {
      const page = Array.from({ length: 500 }, (_, n) => ({
        id: `c-${String(n).padStart(4, '0')}`,
        userAId: ME,
        userBId: OTHER,
        lastMessageAt: new Date(NOW.getTime() - 20 * MINUTE),
        readAAt: new Date(NOW.getTime()),
        readBAt: new Date(NOW.getTime()),
        notifiedAAt: null,
        notifiedBAt: null,
        messages: [{ senderId: OTHER }],
      }));
      t.repo.recentlyActiveConversations.mockResolvedValueOnce(page).mockResolvedValueOnce([]);
      await t.service.emailUnread(NOW);
      expect(t.repo.recentlyActiveConversations).toHaveBeenCalledTimes(2);
      expect(t.repo.recentlyActiveConversations).toHaveBeenLastCalledWith(
        expect.any(Date),
        expect.any(Date),
        'c-0499',
        500,
      );
    });

    it('drops conversation starts older than a day in the hourly cleanup', async () => {
      await t.service.cleanupCheckIns(NOW);
      expect(t.repo.deleteConversationStartsBefore).toHaveBeenCalledWith(
        new Date(NOW.getTime() - 24 * 3600_000),
      );
    });

    it('emails the reader once, in their language, without a nickname, spot or text', async () => {
      t.repo.recentlyActiveConversations.mockResolvedValue([waiting()]);
      expect(await t.service.emailUnread(NOW)).toBe(1);
      expect(t.repo.markNotified).toHaveBeenCalledWith(waiting(), ME, NOW);
      await settle();
      expect(t.sent).toHaveLength(1);
      expect(t.sent[0]?.to).toBe('reader@example.com');
      expect(t.sent[0]?.subject).toBe('Tienes un mensaje sin leer — Cruising');
      for (const text of [SECRET_NICKNAME, SECRET_NAME, SECRET_TEXT]) {
        expect(t.sent[0]?.text).not.toContain(text);
        expect(t.sent[0]?.html).not.toContain(text);
      }
      expect(t.sent[0]?.text).toContain('https://cruising.codeqlick.com/es/messages');
    });

    it('emails an English account in English', async () => {
      t.repo.recentlyActiveConversations.mockResolvedValue([waiting()]);
      t.repo.recipient.mockResolvedValue({
        id: ME,
        email: 'reader@example.com',
        locale: 'EN',
        cruisingProfile: { emailAlerts: true, suspendedAt: null, suspendedUntil: null },
      });
      await t.service.emailUnread(NOW);
      await settle();
      expect(t.sent[0]?.subject).toBe('You have an unread message — Cruising');
    });

    it('works out the reader when the messages come from side A', async () => {
      t.repo.recentlyActiveConversations.mockResolvedValue([
        waiting({ messages: [{ senderId: ME }] }),
      ]);
      await t.service.emailUnread(NOW);
      expect(t.repo.markNotified).toHaveBeenCalledWith(expect.anything(), OTHER, NOW);
    });

    it('does not email what was read after the last message', async () => {
      t.repo.recentlyActiveConversations.mockResolvedValue([
        waiting({ readAAt: new Date(NOW.getTime() - 10 * MINUTE) }),
      ]);
      expect(await t.service.emailUnread(NOW)).toBe(0);
      expect(t.repo.markNotified).not.toHaveBeenCalled();
    });

    it('does not email again until the person reads', async () => {
      t.repo.recentlyActiveConversations.mockResolvedValue([
        waiting({ notifiedAAt: new Date(NOW.getTime() - 5 * MINUTE) }),
      ]);
      expect(await t.service.emailUnread(NOW)).toBe(0);
      // Read after being told, then a newer message: told again.
      t.repo.recentlyActiveConversations.mockResolvedValue([
        waiting({
          notifiedAAt: new Date(NOW.getTime() - 40 * MINUTE),
          readAAt: new Date(NOW.getTime() - 30 * MINUTE),
        }),
      ]);
      expect(await t.service.emailUnread(NOW)).toBe(1);
    });

    it('respects the alerts switch and never mails a suspended member', async () => {
      t.repo.recentlyActiveConversations.mockResolvedValue([waiting()]);
      t.repo.recipient.mockResolvedValue({
        id: ME,
        email: 'reader@example.com',
        locale: 'EN',
        cruisingProfile: { emailAlerts: false, suspendedAt: null, suspendedUntil: null },
      });
      expect(await t.service.emailUnread(NOW)).toBe(0);
      t.repo.recipient.mockResolvedValue({
        id: ME,
        email: 'reader@example.com',
        locale: 'EN',
        cruisingProfile: { emailAlerts: true, suspendedAt: NOW, suspendedUntil: null },
      });
      expect(await t.service.emailUnread(NOW)).toBe(0);
      await settle();
      expect(t.sent).toHaveLength(0);
    });

    it('survives a failing query', async () => {
      t.repo.recentlyActiveConversations.mockRejectedValue(new Error('db down'));
      expect(await t.service.emailUnread(NOW)).toBe(0);
    });
  });

  describe('favourites', () => {
    const spotRow = {
      id: SPOT,
      slug: 'cove',
      name: SECRET_NAME,
      type: 'BEACH',
      lat: '36.5',
      lng: '-6.25',
      ratingAvg: '4.5',
      ratingCount: 2,
    };

    it('lists the LIVE ones with how many are there now', async () => {
      t.repo.favorites.mockResolvedValue([{ createdAt: NOW, spot: spotRow }]);
      t.repo.hereAt.mockResolvedValue(new Map([[SPOT, 3]]));
      t.repo.hiddenIds.mockResolvedValue([OTHER]);
      expect(await t.service.favorites(ME, NOW)).toEqual({
        items: [
          {
            spot: {
              id: SPOT,
              slug: 'cove',
              name: SECRET_NAME,
              type: 'BEACH',
              lat: 36.5,
              lng: -6.25,
              ratingAvg: 4.5,
              ratingCount: 2,
            },
            here: 3,
            savedAt: NOW.toISOString(),
          },
        ],
      });
      expect(t.repo.hereAt).toHaveBeenCalledWith([SPOT], NOW, [OTHER]);
    });

    it('saves LIVE spots only, up to 100, and saving again is fine', async () => {
      await t.service.saveFavorite(ME, SPOT, NOW);
      expect(t.repo.addFavorite).toHaveBeenCalledWith(ME, SPOT, NOW);

      t.repo.findSpot.mockResolvedValue({ id: SPOT, status: 'PENDING' });
      await expect(t.service.saveFavorite(ME, SPOT, NOW)).rejects.toBeInstanceOf(NotFoundException);

      t.repo.findSpot.mockResolvedValue({ id: SPOT, status: 'LIVE' });
      t.repo.countFavorites.mockResolvedValue(100);
      await expect(t.service.saveFavorite(ME, SPOT, NOW)).rejects.toBeInstanceOf(ConflictException);
      // One already saved is not a new one: no 409 at the cap.
      t.repo.isFavorite.mockResolvedValue(true);
      await expect(t.service.saveFavorite(ME, SPOT, NOW)).resolves.toBeUndefined();
    });

    it('need entry', async () => {
      t.repo.findProfile.mockResolvedValue(null);
      await expect(t.service.favorites(ME, NOW)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(t.service.saveFavorite(ME, SPOT, NOW)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(t.service.removeFavorite(ME, SPOT)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('favourite alerts', () => {
    const saver = (over: Record<string, unknown> = {}, pushDevices = 1) => ({
      userId: OTHER,
      user: {
        email: 'saver@example.com',
        locale: 'ES',
        cruisingProfile: {
          favoriteAlerts: true,
          favoriteEmails: false,
          emailAlerts: true,
          ...over,
        },
        _count: { cruisingPushSubscriptions: pushDevices },
      },
    });

    it('leaves out the person checking in and anyone blocked either way', async () => {
      t.repo.hiddenIds.mockResolvedValue(['blocked-id']);
      await t.service.alertFavorites(SPOT, ME, NOW);
      expect(t.repo.favoriteAlertCandidates).toHaveBeenCalledWith(
        SPOT,
        [ME, 'blocked-id'],
        VERSION,
        NOW,
      );
    });

    it('pushes to savers with a device, in their language, and records the alert', async () => {
      t.repo.favoriteAlertCandidates.mockResolvedValue([saver()]);
      expect(await t.service.alertFavorites(SPOT, ME, NOW)).toBe(1);
      expect(t.repo.createAlerts).toHaveBeenCalledWith([
        { userId: OTHER, spotId: SPOT, channel: 'PUSH', createdAt: NOW },
      ]);
      expect(t.push.notify).toHaveBeenCalledWith('favorite', [{ userId: OTHER, locale: 'es' }]);
      expect(t.sent).toHaveLength(0);
      expect(t.notifications.notifyMany).toHaveBeenCalledWith(
        [OTHER],
        'FAVORITE_ACTIVITY',
        { spotId: SPOT },
        NOW,
      );
    });

    it('writes the centre within the caps even with neither push nor email (decision 98)', async () => {
      t.repo.favoriteAlertCandidates.mockResolvedValue([
        saver({ favoriteEmails: false, favoriteAlerts: false }, 0),
      ]);
      expect(await t.service.alertFavorites(SPOT, ME, NOW, 'safety')).toBe(0);
      expect(t.notifications.notifyMany).toHaveBeenLastCalledWith(
        [OTHER],
        'SAFETY_ALERT',
        { spotId: SPOT },
        NOW,
      );
      t.repo.recentAlerts.mockResolvedValue([
        { userId: OTHER, spotId: SPOT, channel: 'PUSH', createdAt: NOW },
      ]);
      await t.service.alertFavorites(SPOT, ME, NOW, 'meetup');
      expect(t.notifications.notifyMany).toHaveBeenLastCalledWith(
        [],
        'MEETUP_PLANNED',
        { spotId: SPOT },
        NOW,
      );
    });

    it('respects the 3 hour and 10 a day caps', async () => {
      t.repo.favoriteAlertCandidates.mockResolvedValue([saver()]);
      t.repo.recentAlerts.mockResolvedValue([
        {
          userId: OTHER,
          spotId: SPOT,
          channel: 'PUSH',
          createdAt: new Date(NOW.getTime() - 2 * 3600_000),
        },
      ]);
      expect(await t.service.alertFavorites(SPOT, ME, NOW)).toBe(0);
      t.repo.recentAlerts.mockResolvedValue(
        Array.from({ length: 10 }, (_, i) => ({
          userId: OTHER,
          spotId: `spot-${i}`,
          channel: 'PUSH',
          createdAt: new Date(NOW.getTime() - (i + 1) * 60_000),
        })),
      );
      expect(await t.service.alertFavorites(SPOT, ME, NOW)).toBe(0);
      expect(t.repo.createAlerts).toHaveBeenLastCalledWith([]);
    });

    it('emails once a day, only to members without push who asked for it', async () => {
      t.repo.favoriteAlertCandidates.mockResolvedValue([saver({ favoriteEmails: true }, 0)]);
      expect(await t.service.alertFavorites(SPOT, ME, NOW)).toBe(1);
      await settle();
      expect(t.sent).toHaveLength(1);
      const email = t.sent[0]!;
      expect(email.to).toBe('saver@example.com');
      expect(email.subject).toBe('Hay actividad en tus lugares favoritos — Cruising');
      // Nothing gives the spot or the person away.
      expect(JSON.stringify(email)).not.toContain(SECRET_NAME);
      expect(JSON.stringify(email)).not.toContain('cove');

      t.repo.recentAlerts.mockResolvedValue([
        {
          userId: OTHER,
          spotId: 'another-spot',
          channel: 'EMAIL',
          createdAt: new Date(NOW.getTime() - 3600_000),
        },
      ]);
      expect(await t.service.alertFavorites(SPOT, ME, NOW)).toBe(0);

      t.repo.recentAlerts.mockResolvedValue([]);
      t.repo.favoriteAlertCandidates.mockResolvedValue([saver({ favoriteEmails: false }, 0)]);
      expect(await t.service.alertFavorites(SPOT, ME, NOW)).toBe(0);
      t.repo.favoriteAlertCandidates.mockResolvedValue([
        saver({ favoriteEmails: true, emailAlerts: false }, 0),
      ]);
      expect(await t.service.alertFavorites(SPOT, ME, NOW)).toBe(0);
    });

    it('treats devices as absent while push is off', async () => {
      t.push.enabled = false;
      t.repo.favoriteAlertCandidates.mockResolvedValue([saver({ favoriteEmails: true }, 2)]);
      expect(await t.service.alertFavorites(SPOT, ME, NOW)).toBe(1);
      expect(t.repo.createAlerts).toHaveBeenCalledWith([
        { userId: OTHER, spotId: SPOT, channel: 'EMAIL', createdAt: NOW },
      ]);
    });

    it('run after a check-in answers, and a failure there never fails the check-in', async () => {
      t.repo.favoriteAlertCandidates.mockRejectedValue(new Error('db down'));
      await expect(
        t.service.checkIn(ME, { spotId: SPOT, hours: 1, anonymous: true }, NOW),
      ).resolves.toMatchObject({ anonymous: true });
      await t.service.idle();
      expect(t.repo.favoriteAlertCandidates).toHaveBeenCalledTimes(1);
    });
  });

  describe('message pushes', () => {
    it('tell the recipient "new message" on their devices', async () => {
      await t.service.sendMessage(ME, CONVERSATION, 'Hello there', NOW);
      await t.service.idle();
      expect(t.push.notify).toHaveBeenCalledWith('message', [{ userId: OTHER, locale: 'es' }]);
      expect(t.notifications.notify).toHaveBeenCalledWith(
        OTHER,
        'MESSAGE',
        { conversationId: CONVERSATION },
        NOW,
      );
    });

    it('write the centre while push is off, and reading the conversation reads it', async () => {
      t.push.enabled = false;
      await t.service.sendMessage(ME, CONVERSATION, 'Hello there', NOW);
      await t.service.idle();
      expect(t.notifications.notify).toHaveBeenCalledTimes(1);
      await t.service.messages(ME, CONVERSATION, undefined, NOW);
      expect(t.notifications.readConversation).toHaveBeenCalledWith(ME, CONVERSATION, NOW);
    });

    it('skip a suspended or blocked recipient, and do nothing while push is off', async () => {
      t.repo.recipient.mockResolvedValue({
        id: OTHER,
        email: 'reader@example.com',
        locale: 'EN',
        cruisingProfile: { emailAlerts: true, suspendedAt: NOW, suspendedUntil: null },
      });
      await t.service.sendMessage(ME, CONVERSATION, 'Hello', NOW);
      await t.service.idle();
      expect(t.push.notify).not.toHaveBeenCalled();

      t.repo.recipient.mockResolvedValue({
        id: OTHER,
        email: 'reader@example.com',
        locale: 'EN',
        cruisingProfile: { emailAlerts: true, suspendedAt: null, suspendedUntil: null },
      });
      t.repo.hiddenIds.mockResolvedValue([OTHER]);
      await t.service.sendMessage(ME, CONVERSATION, 'Hello', NOW);
      await t.service.idle();
      expect(t.push.notify).not.toHaveBeenCalled();
      expect(t.notifications.notify).not.toHaveBeenCalled();

      t.repo.hiddenIds.mockResolvedValue([]);
      t.push.enabled = false;
      await t.service.sendMessage(ME, CONVERSATION, 'Hello', NOW);
      await t.service.idle();
      expect(t.push.notify).not.toHaveBeenCalled();
    });
  });

  describe('push subscriptions', () => {
    const input = {
      endpoint: 'https://push.example.test/abc',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
    };

    it('are kept up to 5 per member', async () => {
      await t.service.subscribePush(ME, input, NOW);
      expect(t.repo.savePushSubscription).toHaveBeenCalledWith(
        ME,
        { endpoint: input.endpoint, p256dh: 'p256dh-key', auth: 'auth-key' },
        5,
        NOW,
      );
    });

    it('answer 409 while notifications are off', async () => {
      t.push.enabled = false;
      await expect(t.service.subscribePush(ME, input, NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(t.repo.savePushSubscription).not.toHaveBeenCalled();
    });

    it('are removed for the member only', async () => {
      await t.service.unsubscribePush(ME, input.endpoint);
      expect(t.repo.deletePushSubscription).toHaveBeenCalledWith(input.endpoint, ME);
    });
  });
});
