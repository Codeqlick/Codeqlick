import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { MailMessage, MailService } from '../mail/mail.service.js';
import { deleteUserRecomputingRatings, recomputeSpotRating } from './cruising.repository.js';
import type { CruisingRepository } from './cruising.repository.js';
import { CruisingService, newSpotFields, spotChanges } from './cruising.service.js';
import type { SpotInput } from './cruising.schemas.js';

const NOW = new Date('2026-11-15T12:00:00Z');
const VERSION = '2026-11-15.1';
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SPOT = '33333333-3333-4333-8333-333333333333';
const REVIEW = '44444444-4444-4444-8444-444444444444';
const SECRET_NAME = 'Secret Cove Of Dreams';
const admin: AuthUser = { id: 'a0', email: 'admin@codeqlick.com', name: 'Admin', role: 'ADMIN' };

const profile = (over: Record<string, unknown> = {}) => ({
  userId: ME,
  birthYear: 1990,
  termsVersion: VERSION,
  acceptedAt: NOW,
  emailAlerts: true,
  suspendedAt: null,
  suspendedUntil: null,
  suspensionReason: null,
  nickname: null,
  bio: '',
  country: null,
  lookingFor: [],
  showAge: true,
  createdAt: NOW,
  ...over,
});

const spotRow = (over: Record<string, unknown> = {}) => ({
  id: SPOT,
  slug: 'secret-cove-of-dreams',
  name: SECRET_NAME,
  type: 'BEACH',
  lat: '40.41678',
  lng: '-3.70379',
  countryCode: 'ES',
  city: 'Madrid',
  citySlug: 'madrid',
  description: 'A cove.',
  bestTimes: null,
  status: 'LIVE',
  rejectReason: null,
  createdById: OTHER,
  ratingAvg: '0',
  ratingCount: 0,
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const input: SpotInput = {
  name: SECRET_NAME,
  type: 'BEACH',
  lat: 40.416775432,
  lng: -3.703790211,
  countryCode: 'ES',
  city: 'Madrid',
  description: 'A cove.',
};

function build() {
  const repo = {
    findProfile: vi.fn().mockResolvedValue(profile()),
    saveOnboarding: vi
      .fn()
      .mockImplementation((userId, termsVersion, birthYear, now) =>
        Promise.resolve(profile({ userId, termsVersion, birthYear, acceptedAt: now })),
      ),
    updateProfile: vi.fn().mockImplementation((_id, data) => Promise.resolve(profile(data))),
    recipient: vi.fn().mockResolvedValue({
      id: OTHER,
      email: 'proposer@example.com',
      locale: 'ES',
      cruisingProfile: { emailAlerts: true },
    }),
    findProfileByNickname: vi.fn().mockResolvedValue(null),
    hiddenIds: vi.fn().mockResolvedValue([]),
    endCheckIns: vi.fn().mockResolvedValue(undefined),
    findConversation: vi.fn().mockResolvedValue(null),
    lastMessages: vi.fn().mockResolvedValue([]),
    findUser: vi.fn().mockResolvedValue({ id: OTHER, name: 'Pro', email: 'proposer@example.com' }),
    findSpot: vi.fn().mockResolvedValue(spotRow()),
    findSpotBySlug: vi.fn().mockResolvedValue(null),
    slugTaken: vi.fn().mockResolvedValue(false),
    createSpot: vi.fn().mockImplementation((data) => Promise.resolve({ id: SPOT, ...data })),
    updateSpot: vi.fn().mockImplementation((id, data) => Promise.resolve(spotRow({ id, ...data }))),
    updateOwnSpot: vi
      .fn()
      .mockImplementation((id, _user, data) => Promise.resolve(spotRow({ id, ...data }))),
    deleteOwnSpot: vi.fn().mockResolvedValue(true),
    countSpotsSince: vi.fn().mockResolvedValue(0),
    spotsInBox: vi.fn().mockResolvedValue([]),
    reviewsOfSpot: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    findReview: vi.fn().mockResolvedValue(null),
    findReviewById: vi.fn(),
    countReviewsTouchedSince: vi.fn().mockResolvedValue(0),
    saveReview: vi.fn().mockImplementation((spotId, userId, rating, text) =>
      Promise.resolve({
        id: REVIEW,
        spotId,
        userId,
        rating,
        text,
        createdAt: NOW,
        updatedAt: NOW,
      }),
    ),
    deleteReview: vi.fn().mockResolvedValue(undefined),
    setReviewStatus: vi.fn().mockResolvedValue(undefined),
    countReportsSince: vi.fn().mockResolvedValue(0),
    createReport: vi.fn().mockResolvedValue({ id: 'report-1' }),
    findReport: vi.fn(),
    closeReport: vi.fn().mockResolvedValue(undefined),
    countOpenReportsOnSpot: vi.fn().mockResolvedValue(0),
    countOpenReportsOnReview: vi.fn().mockResolvedValue(0),
    countOpenTakedownsOnSpot: vi.fn().mockResolvedValue(0),
    createTakedown: vi.fn().mockResolvedValue({ id: 'takedown-1' }),
    findTakedown: vi.fn(),
    closeTakedown: vi.fn().mockResolvedValue(undefined),
    newestPendingAt: vi.fn().mockResolvedValue(null),
    overview: vi.fn().mockResolvedValue({ pendingSpots: 2, openReports: 1, openTakedowns: 0 }),
  };
  const sent: MailMessage[] = [];
  const mail = {
    send: vi.fn().mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    }),
  };
  const activity = { record: vi.fn().mockResolvedValue(undefined) };
  const config = {
    isTest: true,
    cruisingTermsVersion: VERSION,
    leadsNotifyTo: 'team@codeqlick.com',
    siteUrl: 'https://codeqlick.com',
    webappUrl: () => 'https://cruising.codeqlick.com',
  };
  const service = new CruisingService(
    repo as unknown as CruisingRepository,
    activity as unknown as ActivityService,
    mail as unknown as MailService,
    config as unknown as AppConfigService,
  );
  return { service, repo, sent, activity, config };
}

/** Lets the emails sent without waiting (fire and forget) settle. */
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('CruisingService', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => {
    t = build();
  });

  describe('entry', () => {
    const body = {
      acceptTerms: true as const,
      consentSpecialData: true as const,
      termsVersion: VERSION,
    };

    it('stores only the year of birth', async () => {
      const status = await t.service.onboard(ME, { ...body, birthDate: '1990-06-15' }, NOW);
      expect(t.repo.saveOnboarding).toHaveBeenCalledWith(ME, VERSION, 1990, NOW);
      expect(JSON.stringify(t.repo.saveOnboarding.mock.calls)).not.toContain('06-15');
      expect(status).toMatchObject({ onboarded: true, allowed: true, suspended: false });
    });

    it('refuses under 18 and stores nothing', async () => {
      await expect(
        t.service.onboard(ME, { ...body, birthDate: '2008-11-16' }, NOW),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(t.repo.saveOnboarding).not.toHaveBeenCalled();
    });

    it('admits someone who turns 18 today', async () => {
      await expect(
        t.service.onboard(ME, { ...body, birthDate: '2008-11-15' }, NOW),
      ).resolves.toMatchObject({ onboarded: true });
    });

    it('refuses an impossible age', async () => {
      await expect(
        t.service.onboard(ME, { ...body, birthDate: '1800-01-01' }, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an old terms version with 409', async () => {
      await expect(
        t.service.onboard(
          ME,
          { ...body, termsVersion: '2000-01-01', birthDate: '1990-01-01' },
          NOW,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(t.repo.saveOnboarding).not.toHaveBeenCalled();
    });

    it('asks again when the rules changed', async () => {
      t.repo.findProfile.mockResolvedValue(profile({ termsVersion: 'old' }));
      expect(await t.service.status(ME, NOW)).toMatchObject({
        onboarded: false,
        allowed: false,
        acceptedTermsVersion: 'old',
        termsVersion: VERSION,
      });
      await expect(t.service.proposeSpot(ME, input, NOW)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('reports no profile as not entered', async () => {
      t.repo.findProfile.mockResolvedValue(null);
      expect(await t.service.status(ME, NOW)).toMatchObject({
        onboarded: false,
        allowed: false,
        emailAlerts: true,
        profile: null,
      });
    });

    it('needs entry to change the profile, but a suspended member still can', async () => {
      t.repo.findProfile.mockResolvedValue(null);
      await expect(t.service.updateProfile(ME, { emailAlerts: false }, NOW)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      t.repo.findProfile.mockResolvedValue(profile({ suspendedAt: NOW }));
      await t.service.updateProfile(ME, { emailAlerts: false }, NOW);
      expect(t.repo.updateProfile).toHaveBeenCalledWith(ME, { emailAlerts: false });
    });

    it('shows a suspension in the status until it ends', async () => {
      const until = new Date(NOW.getTime() + 3600_000);
      t.repo.findProfile.mockResolvedValue(
        profile({ suspendedAt: NOW, suspendedUntil: until, suspensionReason: 'Spam' }),
      );
      expect(await t.service.status(ME, NOW)).toMatchObject({
        suspended: true,
        allowed: false,
        suspension: { reason: 'Spam', until: until.toISOString() },
      });
      expect(await t.service.status(ME, new Date(until.getTime() + 1))).toMatchObject({
        suspended: false,
        allowed: true,
        suspension: null,
      });
    });
  });

  describe('the map', () => {
    const box = { minLng: -4, minLat: 40, maxLng: -3, maxLat: 41 };
    const row = (n: number) => ({
      id: String(n),
      slug: `s-${n}`,
      name: `S ${n}`,
      type: 'PARK',
      lat: '40.1',
      lng: '-3.5',
      ratingAvg: '4.5',
      ratingCount: 2,
    });

    it('returns at most 500 spots and flags truncation', async () => {
      t.repo.spotsInBox.mockResolvedValue(Array.from({ length: 501 }, (_, n) => row(n)));
      const result = await t.service.spotsInBox(box, 'PARK');
      expect(t.repo.spotsInBox).toHaveBeenCalledWith(box, 'PARK', 501);
      expect(result.items).toHaveLength(500);
      expect(result.truncated).toBe(true);
      expect(result.items[0]).toEqual({
        id: '0',
        slug: 's-0',
        name: 'S 0',
        type: 'PARK',
        lat: 40.1,
        lng: -3.5,
        ratingAvg: 4.5,
        ratingCount: 2,
      });
    });

    it('is not truncated at exactly 500', async () => {
      t.repo.spotsInBox.mockResolvedValue(Array.from({ length: 500 }, (_, n) => row(n)));
      const result = await t.service.spotsInBox(box);
      expect(result.items).toHaveLength(500);
      expect(result.truncated).toBe(false);
    });
  });

  describe('public pages', () => {
    it('shows only LIVE spots by slug', async () => {
      t.repo.findSpotBySlug.mockResolvedValue(spotRow());
      expect(await t.service.spotBySlug('secret-cove-of-dreams')).toMatchObject({
        slug: 'secret-cove-of-dreams',
        lat: 40.41678,
        city: 'Madrid',
      });
      for (const status of ['PENDING', 'REJECTED', 'HIDDEN']) {
        t.repo.findSpotBySlug.mockResolvedValue(spotRow({ status }));
        await expect(t.service.spotBySlug('x')).rejects.toBeInstanceOf(NotFoundException);
      }
      t.repo.findSpotBySlug.mockResolvedValue(null);
      await expect(t.service.spotBySlug('x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('proposing a spot', () => {
    it('creates it PENDING with rounded coordinates and the city slug', async () => {
      const result = await t.service.proposeSpot(ME, input, NOW);
      expect(result).toEqual({ id: SPOT, slug: 'secret-cove-of-dreams', status: 'PENDING' });
      expect(t.repo.createSpot).toHaveBeenCalledWith(
        expect.objectContaining({
          lat: 40.41678,
          lng: -3.70379,
          citySlug: 'madrid',
          status: 'PENDING',
          createdById: ME,
          bestTimes: null,
        }),
      );
    });

    it('allows 5 a day and refuses the sixth with 429', async () => {
      t.repo.countSpotsSince.mockResolvedValue(4);
      await expect(t.service.proposeSpot(ME, input, NOW)).resolves.toBeDefined();
      t.repo.countSpotsSince.mockResolvedValue(5);
      const error = await t.service.proposeSpot(ME, input, NOW).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect(t.repo.countSpotsSince).toHaveBeenLastCalledWith(
        ME,
        new Date(NOW.getTime() - 24 * 3600_000),
      );
    });

    it('is refused for a suspended member', async () => {
      t.repo.findProfile.mockResolvedValue(profile({ suspendedAt: NOW }));
      await expect(t.service.proposeSpot(ME, input, NOW)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('gives a unique slug: -2, -3 on a clash', async () => {
      const taken = new Set(['secret-cove-of-dreams', 'secret-cove-of-dreams-2']);
      t.repo.slugTaken.mockImplementation((slug: string) => Promise.resolve(taken.has(slug)));
      const result = await t.service.proposeSpot(ME, input, NOW);
      expect(result.slug).toBe('secret-cove-of-dreams-3');
    });

    it('looks again when someone takes the slug in between', async () => {
      t.repo.createSpot
        .mockRejectedValueOnce(Object.assign(new Error('unique'), { code: 'P2002' }))
        .mockImplementation((data) => Promise.resolve({ id: SPOT, ...data }));
      await expect(t.service.proposeSpot(ME, input, NOW)).resolves.toMatchObject({ id: SPOT });
      expect(t.repo.createSpot).toHaveBeenCalledTimes(2);
    });

    it('lets other errors through', async () => {
      t.repo.createSpot.mockRejectedValue(new Error('boom'));
      await expect(t.service.proposeSpot(ME, input, NOW)).rejects.toThrow('boom');
      expect(t.repo.createSpot).toHaveBeenCalledTimes(1);
    });
  });

  describe('fields of a spot', () => {
    it('rounds coordinates to 5 decimals and derives the city slug', () => {
      expect(newSpotFields({ ...input, city: 'São Paulo', bestTimes: '  ' })).toMatchObject({
        lat: 40.41678,
        lng: -3.70379,
        citySlug: 'sao-paulo',
        bestTimes: null,
      });
      expect(spotChanges({ lat: 1.123456789, city: 'Málaga', bestTimes: 'evenings' })).toEqual({
        lat: 1.12346,
        city: 'Málaga',
        citySlug: 'malaga',
        bestTimes: 'evenings',
      });
      expect(spotChanges({ bestTimes: null })).toEqual({ bestTimes: null });
      expect(spotChanges({ name: 'New' })).toEqual({ name: 'New' });
    });
  });

  describe('the proposer edits and deletes', () => {
    beforeEach(() => {
      t.repo.findSpot.mockResolvedValue(spotRow({ createdById: ME, status: 'PENDING' }));
    });

    it('edits a PENDING spot and keeps it PENDING', async () => {
      const result = await t.service.editSpot(ME, SPOT, { description: 'Better' }, NOW);
      expect(result.status).toBe('PENDING');
      expect(t.repo.updateOwnSpot).toHaveBeenCalledWith(SPOT, ME, { description: 'Better' });
    });

    it('sends a REJECTED spot back to PENDING when edited', async () => {
      t.repo.findSpot.mockResolvedValue(
        spotRow({ createdById: ME, status: 'REJECTED', rejectReason: 'Too close to a school' }),
      );
      const result = await t.service.editSpot(ME, SPOT, { name: 'Another name' }, NOW);
      expect(result.status).toBe('PENDING');
      expect(t.repo.updateOwnSpot).toHaveBeenCalledWith(SPOT, ME, {
        name: 'Another name',
        status: 'PENDING',
        rejectReason: null,
      });
    });

    it.each(['LIVE', 'HIDDEN'])(
      'refuses editing or deleting a %s spot with 409',
      async (status) => {
        t.repo.findSpot.mockResolvedValue(spotRow({ createdById: ME, status }));
        await expect(t.service.editSpot(ME, SPOT, { name: 'x y' }, NOW)).rejects.toBeInstanceOf(
          ConflictException,
        );
        await expect(t.service.deleteSpot(ME, SPOT)).rejects.toBeInstanceOf(ConflictException);
        expect(t.repo.updateOwnSpot).not.toHaveBeenCalled();
        expect(t.repo.deleteOwnSpot).not.toHaveBeenCalled();
      },
    );

    it('answers 404 for a spot that is not mine', async () => {
      t.repo.findSpot.mockResolvedValue(spotRow({ createdById: OTHER, status: 'PENDING' }));
      await expect(t.service.editSpot(ME, SPOT, { name: 'x y' }, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(t.service.deleteSpot(ME, SPOT)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('answers 409 when the team decided in between', async () => {
      t.repo.updateOwnSpot.mockResolvedValue(null);
      await expect(t.service.editSpot(ME, SPOT, { name: 'x y' }, NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
      t.repo.deleteOwnSpot.mockResolvedValue(false);
      await expect(t.service.deleteSpot(ME, SPOT)).rejects.toBeInstanceOf(ConflictException);
    });

    it('deletes a PENDING spot', async () => {
      await t.service.deleteSpot(ME, SPOT);
      expect(t.repo.deleteOwnSpot).toHaveBeenCalledWith(SPOT, ME);
    });
  });

  describe('reviews', () => {
    it('are visible only to members who entered', async () => {
      t.repo.findProfile.mockResolvedValue(null);
      await expect(t.service.reviews(ME, SPOT, 1, 20)).rejects.toBeInstanceOf(ForbiddenException);
      t.repo.findProfile.mockResolvedValue(profile());
      t.repo.reviewsOfSpot.mockResolvedValue({
        items: [
          { id: 'r1', rating: 4, text: 'Nice', userId: ME, createdAt: NOW, updatedAt: NOW },
          { id: 'r2', rating: 2, text: null, userId: OTHER, createdAt: NOW, updatedAt: NOW },
        ],
        total: 2,
      });
      const page = await t.service.reviews(ME, SPOT, 1, 20);
      expect(page.items.map((item) => item.mine)).toEqual([true, false]);
      expect(page.items.every((item) => item.author === null)).toBe(true);
      expect(JSON.stringify(page)).not.toContain(OTHER);
    });

    it('are for LIVE spots only', async () => {
      t.repo.findSpot.mockResolvedValue(spotRow({ status: 'HIDDEN' }));
      await expect(t.service.reviews(ME, SPOT, 1, 20)).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        t.service.saveReview(ME, SPOT, { rating: 5, text: null }, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('are saved as the one review of the member', async () => {
      const view = await t.service.saveReview(ME, SPOT, { rating: 4, text: 'Quiet' }, NOW);
      expect(t.repo.saveReview).toHaveBeenCalledWith(SPOT, ME, 4, 'Quiet');
      expect(view).toMatchObject({
        id: REVIEW,
        rating: 4,
        text: 'Quiet',
        mine: true,
        author: null,
      });
    });

    it.each([
      'call me +34 612 345 678',
      'write to me at john@example.com',
      'see https://example.com',
      'add me on telegram',
      'follow @someone_else',
    ])('refuse text that shares contact details: %s', async (text) => {
      await expect(t.service.saveReview(ME, SPOT, { rating: 3, text }, NOW)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(t.repo.saveReview).not.toHaveBeenCalled();
    });

    it('allow a rating without text', async () => {
      await t.service.saveReview(ME, SPOT, { rating: 5, text: null }, NOW);
      expect(t.repo.saveReview).toHaveBeenCalledWith(SPOT, ME, 5, null);
    });

    it('are limited to 10 a day, creating or editing', async () => {
      t.repo.countReviewsTouchedSince.mockResolvedValue(10);
      const error = await t.service
        .saveReview(ME, SPOT, { rating: 3, text: null }, NOW)
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(429);

      // Editing one I already touched today doesn't add to the count.
      t.repo.findReview.mockResolvedValue({
        id: REVIEW,
        updatedAt: new Date(NOW.getTime() - 3600_000),
      });
      await expect(
        t.service.saveReview(ME, SPOT, { rating: 3, text: null }, NOW),
      ).resolves.toBeDefined();

      // An old review being edited again is a new touch.
      t.repo.findReview.mockResolvedValue({
        id: REVIEW,
        updatedAt: new Date(NOW.getTime() - 48 * 3600_000),
      });
      await expect(
        t.service.saveReview(ME, SPOT, { rating: 3, text: null }, NOW),
      ).rejects.toBeInstanceOf(HttpException);
    });

    it('are refused to a suspended member', async () => {
      t.repo.findProfile.mockResolvedValue(profile({ suspendedAt: NOW }));
      await expect(
        t.service.saveReview(ME, SPOT, { rating: 3, text: null }, NOW),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('can be deleted by their author only', async () => {
      await expect(t.service.deleteReview(ME, SPOT)).rejects.toBeInstanceOf(NotFoundException);
      t.repo.findReview.mockResolvedValue({ id: REVIEW });
      await t.service.deleteReview(ME, SPOT);
      expect(t.repo.deleteReview).toHaveBeenCalledWith(REVIEW);
    });
  });

  describe('rating recompute', () => {
    it('stores the average with 2 decimals and the count of LIVE reviews', async () => {
      const tx = {
        cruisingReview: {
          aggregate: vi
            .fn()
            .mockResolvedValue({ _avg: { rating: 4.3333333 }, _count: { _all: 3 } }),
        },
        cruisingSpot: { update: vi.fn().mockResolvedValue(undefined) },
      };
      await recomputeSpotRating(tx as never, SPOT);
      expect(tx.cruisingReview.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { spotId: SPOT, status: 'LIVE' } }),
      );
      expect(tx.cruisingSpot.update).toHaveBeenCalledWith({
        where: { id: SPOT },
        data: { ratingAvg: 4.33, ratingCount: 3 },
      });
    });

    it('goes back to 0 and 0 with no LIVE review', async () => {
      const tx = {
        cruisingReview: {
          aggregate: vi.fn().mockResolvedValue({ _avg: { rating: null }, _count: { _all: 0 } }),
        },
        cruisingSpot: { update: vi.fn().mockResolvedValue(undefined) },
      };
      await recomputeSpotRating(tx as never, SPOT);
      expect(tx.cruisingSpot.update).toHaveBeenCalledWith({
        where: { id: SPOT },
        data: { ratingAvg: 0, ratingCount: 0 },
      });
    });

    it('is worked out again for every spot an account reviewed when it is deleted', async () => {
      const order: string[] = [];
      const tx = {
        cruisingReview: {
          findMany: vi.fn().mockResolvedValue([{ spotId: 'a' }, { spotId: 'b' }, { spotId: 'a' }]),
          aggregate: vi.fn().mockImplementation(({ where }: { where: { spotId: string } }) => {
            order.push(`recompute ${where.spotId}`);
            return Promise.resolve({ _avg: { rating: null }, _count: { _all: 0 } });
          }),
        },
        user: {
          delete: vi.fn().mockImplementation(() => {
            order.push('delete user');
            return Promise.resolve(undefined);
          }),
        },
        cruisingSpot: { update: vi.fn().mockResolvedValue(undefined) },
      };
      const prisma = { $transaction: (fn: (client: typeof tx) => Promise<void>) => fn(tx) };
      await deleteUserRecomputingRatings(prisma as never, ME);
      expect(order).toEqual(['delete user', 'recompute a', 'recompute b']);
    });
  });

  describe('reports', () => {
    const liveReview = (over: Record<string, unknown> = {}) => ({
      id: REVIEW,
      userId: OTHER,
      status: 'LIVE',
      spot: { id: SPOT, slug: 's', name: SECRET_NAME, status: 'LIVE' },
      ...over,
    });

    it('hides a spot at once for MINOR and emails the team', async () => {
      await t.service.report(ME, { spotId: SPOT, reason: 'MINOR' }, NOW);
      expect(t.repo.createReport).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: 'SPOT', spotId: SPOT, reportedId: OTHER }),
      );
      expect(t.repo.updateSpot).toHaveBeenCalledWith(SPOT, { status: 'HIDDEN' });
      await settle();
      expect(t.sent).toHaveLength(1);
      expect(t.sent[0]?.to).toBe('team@codeqlick.com');
      expect(t.sent[0]?.subject).toBe('Cruising: possible minor reported');
      expect(t.sent[0]?.text).not.toContain(SECRET_NAME);
    });

    it('hides a spot at once for ILLEGAL without the urgent email', async () => {
      await t.service.report(ME, { spotId: SPOT, reason: 'ILLEGAL' }, NOW);
      expect(t.repo.updateSpot).toHaveBeenCalledWith(SPOT, { status: 'HIDDEN' });
      await settle();
      expect(t.sent).toHaveLength(0);
    });

    it.each(['DANGER', 'HARASSMENT', 'SPAM', 'OTHER'] as const)(
      'leaves a spot live for %s',
      async (reason) => {
        await t.service.report(ME, { spotId: SPOT, reason }, NOW);
        expect(t.repo.createReport).toHaveBeenCalled();
        expect(t.repo.updateSpot).not.toHaveBeenCalled();
      },
    );

    it('takes WRONG_INFO on a spot only', async () => {
      await t.service.report(
        ME,
        { spotId: SPOT, reason: 'WRONG_INFO', details: 'Wrong city' },
        NOW,
      );
      expect(t.repo.createReport).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'WRONG_INFO', details: 'Wrong city' }),
      );
      await expect(
        t.service.report(ME, { reviewId: REVIEW, reason: 'WRONG_INFO', details: 'x' }, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('hides a review at once for MINOR and emails the team', async () => {
      t.repo.findReviewById.mockResolvedValue(liveReview());
      await t.service.report(ME, { reviewId: REVIEW, reason: 'MINOR' }, NOW);
      expect(t.repo.createReport).toHaveBeenCalledWith(
        expect.objectContaining({ targetType: 'REVIEW', reviewId: REVIEW, reportedId: OTHER }),
      );
      expect(t.repo.setReviewStatus).toHaveBeenCalledWith(REVIEW, 'HIDDEN');
      await settle();
      expect(t.sent).toHaveLength(1);
    });

    it('does not hide a review for DANGER', async () => {
      t.repo.findReviewById.mockResolvedValue(liveReview());
      await t.service.report(ME, { reviewId: REVIEW, reason: 'DANGER' }, NOW);
      expect(t.repo.setReviewStatus).not.toHaveBeenCalled();
    });

    it('answers 404 for my own review, a hidden review or a review of a hidden spot', async () => {
      for (const review of [
        liveReview({ userId: ME }),
        liveReview({ status: 'HIDDEN' }),
        liveReview({ spot: { id: SPOT, slug: 's', name: 'n', status: 'HIDDEN' } }),
        null,
      ]) {
        t.repo.findReviewById.mockResolvedValue(review);
        await expect(
          t.service.report(ME, { reviewId: REVIEW, reason: 'SPAM' }, NOW),
        ).rejects.toBeInstanceOf(NotFoundException);
      }
    });

    it('answers 404 for a spot that is not live', async () => {
      t.repo.findSpot.mockResolvedValue(spotRow({ status: 'PENDING' }));
      await expect(
        t.service.report(ME, { spotId: SPOT, reason: 'SPAM' }, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('are limited to 20 a day', async () => {
      t.repo.countReportsSince.mockResolvedValue(20);
      const error = await t.service
        .report(ME, { spotId: SPOT, reason: 'SPAM' }, NOW)
        .catch((e: unknown) => e);
      expect((error as HttpException).getStatus()).toBe(429);
      expect(t.repo.createReport).not.toHaveBeenCalled();
    });

    it('are refused to a suspended member and one who has not entered', async () => {
      t.repo.findProfile.mockResolvedValue(profile({ suspendedAt: NOW }));
      await expect(
        t.service.report(ME, { spotId: SPOT, reason: 'SPAM' }, NOW),
      ).rejects.toBeInstanceOf(ForbiddenException);
      t.repo.findProfile.mockResolvedValue(null);
      await expect(
        t.service.report(ME, { spotId: SPOT, reason: 'SPAM' }, NOW),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('removal requests', () => {
    const body = {
      email: 'person@example.com',
      reason: 'ILLEGAL' as const,
      details: 'This place should not be listed.',
      locale: 'es' as const,
    };

    it('hide the LIVE spot their link names and email the team and the person', async () => {
      t.repo.findSpotBySlug.mockResolvedValue(spotRow());
      const result = await t.service.takedown(
        { ...body, spotLink: 'https://cruising.codeqlick.com/es/spots/secret-cove-of-dreams' },
        NOW,
      );
      expect(result).toEqual({ id: 'takedown-1' });
      expect(t.repo.findSpotBySlug).toHaveBeenCalledWith('secret-cove-of-dreams');
      expect(t.repo.createTakedown).toHaveBeenCalledWith(
        expect.objectContaining({ spotId: SPOT, locale: 'ES', email: body.email }),
      );
      expect(t.repo.updateSpot).toHaveBeenCalledWith(SPOT, { status: 'HIDDEN' });
      await settle();
      expect(t.sent.map((mail) => mail.to).toSorted()).toEqual([
        'person@example.com',
        'team@codeqlick.com',
      ]);
      const ack = t.sent.find((mail) => mail.to === 'person@example.com');
      expect(ack?.subject).toBe('Hemos recibido tu solicitud de retirada — Cruising');
      for (const mail of t.sent) {
        expect(mail.text).not.toContain(SECRET_NAME);
        expect(mail.html).not.toContain(SECRET_NAME);
      }
    });

    it('do not touch a spot that is not live', async () => {
      t.repo.findSpotBySlug.mockResolvedValue(spotRow({ status: 'PENDING' }));
      await t.service.takedown({ ...body, spotLink: 'secret-cove-of-dreams' }, NOW);
      expect(t.repo.createTakedown).toHaveBeenCalledWith(expect.objectContaining({ spotId: SPOT }));
      expect(t.repo.updateSpot).not.toHaveBeenCalled();
    });

    it('are stored without a spot when the link matches none', async () => {
      await t.service.takedown({ ...body, spotLink: 'https://example.com/nothing' }, NOW);
      expect(t.repo.findSpotBySlug).not.toHaveBeenCalled();
      expect(t.repo.createTakedown).toHaveBeenCalledWith(
        expect.objectContaining({ spotId: null, spotLink: 'https://example.com/nothing' }),
      );
    });

    it('pretend to work for the honeypot and store nothing', async () => {
      const result = await t.service.takedown({ ...body, website: 'http://spam' }, NOW);
      expect(result.id).toBeTruthy();
      expect(t.repo.createTakedown).not.toHaveBeenCalled();
      await settle();
      expect(t.sent).toHaveLength(0);
    });
  });

  describe('the team decides on spots', () => {
    it('approves a PENDING spot and tells the proposer without the spot name', async () => {
      t.repo.findSpot.mockResolvedValue(spotRow({ status: 'PENDING' }));
      await t.service.approveSpot(admin, SPOT, NOW);
      expect(t.repo.updateSpot).toHaveBeenCalledWith(SPOT, {
        status: 'LIVE',
        rejectReason: null,
        reviewedAt: NOW,
      });
      expect(t.activity.record).toHaveBeenCalledWith(
        admin,
        expect.objectContaining({ action: 'cruising.spot_approved' }),
      );
      await settle();
      expect(t.sent).toHaveLength(1);
      expect(t.sent[0]?.to).toBe('proposer@example.com');
      // The proposer's account is in Spanish.
      expect(t.sent[0]?.subject).toBe('Tu lugar ya está publicado — Cruising');
      expect(t.sent[0]?.text).not.toContain(SECRET_NAME);
      expect(t.sent[0]?.html).not.toContain(SECRET_NAME);
    });

    it('does not email when the proposer turned the alerts off', async () => {
      t.repo.findSpot.mockResolvedValue(spotRow({ status: 'PENDING' }));
      t.repo.recipient.mockResolvedValue({
        id: OTHER,
        email: 'proposer@example.com',
        locale: 'EN',
        cruisingProfile: { emailAlerts: false },
      });
      await t.service.approveSpot(admin, SPOT, NOW);
      await settle();
      expect(t.sent).toHaveLength(0);
    });

    it('does not email when a hidden spot is put back, nor when nobody proposed it', async () => {
      t.repo.findSpot.mockResolvedValue(spotRow({ status: 'HIDDEN' }));
      await t.service.approveSpot(admin, SPOT, NOW);
      t.repo.findSpot.mockResolvedValue(spotRow({ status: 'PENDING', createdById: null }));
      await t.service.approveSpot(admin, SPOT, NOW);
      await settle();
      expect(t.sent).toHaveLength(0);
    });

    it('refuses to approve a live spot, hide one that is not live, or reject twice', async () => {
      t.repo.findSpot.mockResolvedValue(spotRow({ status: 'LIVE' }));
      await expect(t.service.approveSpot(admin, SPOT, NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
      t.repo.findSpot.mockResolvedValue(spotRow({ status: 'PENDING' }));
      await expect(t.service.hideSpot(admin, SPOT, NOW)).rejects.toBeInstanceOf(ConflictException);
      t.repo.findSpot.mockResolvedValue(spotRow({ status: 'REJECTED' }));
      await expect(
        t.service.rejectSpot(admin, SPOT, 'Too close to a school', NOW),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(t.repo.updateSpot).not.toHaveBeenCalled();
    });

    it('hides a live spot', async () => {
      await t.service.hideSpot(admin, SPOT, NOW);
      expect(t.repo.updateSpot).toHaveBeenCalledWith(SPOT, { status: 'HIDDEN', reviewedAt: NOW });
    });

    it('rejects with a reason and emails the reason, never the spot name', async () => {
      t.repo.findSpot.mockResolvedValue(spotRow({ status: 'PENDING' }));
      await t.service.rejectSpot(admin, SPOT, 'Too close to a school', NOW);
      expect(t.repo.updateSpot).toHaveBeenCalledWith(SPOT, {
        status: 'REJECTED',
        rejectReason: 'Too close to a school',
        reviewedAt: NOW,
      });
      await settle();
      expect(t.sent).toHaveLength(1);
      expect(t.sent[0]?.text).toContain('Too close to a school');
      expect(t.sent[0]?.text).not.toContain(SECRET_NAME);
    });

    it('answers 404 for an unknown spot', async () => {
      t.repo.findSpot.mockResolvedValue(null);
      await expect(t.service.approveSpot(admin, SPOT, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('corrects fields without touching the slug', async () => {
      await t.service.correctSpot(admin, SPOT, { name: 'Fixed', lat: 1.0000049 });
      expect(t.repo.updateSpot).toHaveBeenCalledWith(SPOT, { name: 'Fixed', lat: 1 });
    });
  });

  describe('the team decides on reports', () => {
    const report = (over: Record<string, unknown> = {}) => ({
      id: 'report-1',
      status: 'OPEN',
      targetType: 'SPOT',
      reason: 'MINOR',
      reportedId: OTHER,
      spot: spotRow({ status: 'HIDDEN' }),
      review: null,
      ...over,
    });

    it('answers 404 unless the report is open', async () => {
      t.repo.findReport.mockResolvedValue(report({ status: 'DISMISSED' }));
      await expect(t.service.dismissReport(admin, 'report-1', NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      t.repo.findReport.mockResolvedValue(null);
      await expect(
        t.service.actOnReport(admin, 'report-1', { remove: true, suspend: null }, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('dismissing puts a hidden spot back when nothing else is open', async () => {
      t.repo.findReport.mockResolvedValue(report());
      await t.service.dismissReport(admin, 'report-1', NOW);
      expect(t.repo.closeReport).toHaveBeenCalledWith('report-1', 'DISMISSED', admin.id, NOW);
      expect(t.repo.updateSpot).toHaveBeenCalledWith(SPOT, { status: 'LIVE' });
    });

    it('dismissing keeps it hidden while another report or a removal request is open', async () => {
      t.repo.findReport.mockResolvedValue(report());
      t.repo.countOpenReportsOnSpot.mockResolvedValue(1);
      await t.service.dismissReport(admin, 'report-1', NOW);
      expect(t.repo.updateSpot).not.toHaveBeenCalled();
      t.repo.countOpenReportsOnSpot.mockResolvedValue(0);
      t.repo.countOpenTakedownsOnSpot.mockResolvedValue(1);
      await t.service.dismissReport(admin, 'report-1', NOW);
      expect(t.repo.updateSpot).not.toHaveBeenCalled();
    });

    it('dismissing restores a hidden review when nothing else is open', async () => {
      t.repo.findReport.mockResolvedValue(
        report({ targetType: 'REVIEW', spot: null, review: { id: REVIEW, status: 'HIDDEN' } }),
      );
      await t.service.dismissReport(admin, 'report-1', NOW);
      expect(t.repo.setReviewStatus).toHaveBeenCalledWith(REVIEW, 'LIVE');
    });

    it('dismissing a report that hid nothing restores nothing', async () => {
      t.repo.findReport.mockResolvedValue(report({ reason: 'DANGER', spot: spotRow() }));
      await t.service.dismissReport(admin, 'report-1', NOW);
      expect(t.repo.updateSpot).not.toHaveBeenCalled();
    });

    it('acting with remove rejects the spot with the reason, and suspends', async () => {
      t.repo.findReport.mockResolvedValue(report());
      await t.service.actOnReport(
        admin,
        'report-1',
        { remove: true, suspend: '7d', reason: 'Minors involved' },
        NOW,
      );
      expect(t.repo.updateSpot).toHaveBeenCalledWith(
        SPOT,
        expect.objectContaining({ status: 'REJECTED', rejectReason: 'Minors involved' }),
      );
      expect(t.repo.updateProfile).toHaveBeenCalledWith(OTHER, {
        suspendedAt: NOW,
        suspendedUntil: new Date(NOW.getTime() + 7 * 24 * 3600_000),
        suspensionReason: 'Minors involved',
      });
      expect(t.repo.closeReport).toHaveBeenCalledWith('report-1', 'ACTIONED', admin.id, NOW);
    });

    it('acting with remove deletes the reported review (the rating is recomputed there)', async () => {
      t.repo.findReport.mockResolvedValue(
        report({ targetType: 'REVIEW', spot: null, review: { id: REVIEW, status: 'LIVE' } }),
      );
      await t.service.actOnReport(admin, 'report-1', { remove: true, suspend: null }, NOW);
      expect(t.repo.deleteReview).toHaveBeenCalledWith(REVIEW);
      expect(t.repo.updateProfile).not.toHaveBeenCalled();
    });

    it('cannot suspend nobody', async () => {
      t.repo.findReport.mockResolvedValue(report({ reportedId: null }));
      await expect(
        t.service.actOnReport(admin, 'report-1', { remove: false, suspend: '24h' }, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(t.repo.closeReport).not.toHaveBeenCalled();
    });
  });

  describe('the team decides on removal requests', () => {
    const request = (over: Record<string, unknown> = {}) => ({
      id: 'takedown-1',
      status: 'OPEN',
      email: 'person@example.com',
      locale: 'EN',
      spot: spotRow({ status: 'HIDDEN' }),
      ...over,
    });

    it('removing rejects the spot and emails the person', async () => {
      t.repo.findTakedown.mockResolvedValue(request());
      await t.service.decideTakedown(admin, 'takedown-1', { remove: true, response: 'Done.' }, NOW);
      expect(t.repo.updateSpot).toHaveBeenCalledWith(
        SPOT,
        expect.objectContaining({ status: 'REJECTED' }),
      );
      expect(t.repo.closeTakedown).toHaveBeenCalledWith(
        'takedown-1',
        'REMOVED',
        'Done.',
        admin.id,
        NOW,
      );
      await settle();
      expect(t.sent[0]?.subject).toBe('We removed the spot — Cruising');
      expect(t.sent[0]?.text).not.toContain(SECRET_NAME);
    });

    it('closing restores the spot when nothing else is open', async () => {
      t.repo.findTakedown.mockResolvedValue(request());
      await t.service.decideTakedown(admin, 'takedown-1', { remove: false }, NOW);
      expect(t.repo.updateSpot).toHaveBeenCalledWith(SPOT, { status: 'LIVE' });
      expect(t.repo.countOpenTakedownsOnSpot).toHaveBeenCalledWith(SPOT, 'takedown-1');
      expect(t.repo.closeTakedown).toHaveBeenCalledWith(
        'takedown-1',
        'CLOSED',
        null,
        admin.id,
        NOW,
      );
    });

    it('closing keeps the spot hidden while a report is open', async () => {
      t.repo.findTakedown.mockResolvedValue(request());
      t.repo.countOpenReportsOnSpot.mockResolvedValue(1);
      await t.service.decideTakedown(admin, 'takedown-1', { remove: false }, NOW);
      expect(t.repo.updateSpot).not.toHaveBeenCalled();
    });

    it('answers 404 unless the request is open', async () => {
      t.repo.findTakedown.mockResolvedValue(request({ status: 'CLOSED' }));
      await expect(
        t.service.decideTakedown(admin, 'takedown-1', { remove: true }, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('suspensions', () => {
    it('suspends, records it and emails the person with the reason', async () => {
      await t.service.suspend(admin, OTHER, { duration: '24h', reason: 'Spam' }, NOW);
      expect(t.repo.updateProfile).toHaveBeenCalledWith(OTHER, {
        suspendedAt: NOW,
        suspendedUntil: new Date(NOW.getTime() + 24 * 3600_000),
        suspensionReason: 'Spam',
      });
      await settle();
      expect(t.sent[0]?.text).toContain('Spam');
    });

    it('a permanent suspension has no end', async () => {
      await t.service.suspend(admin, OTHER, { duration: 'permanent' }, NOW);
      expect(t.repo.updateProfile).toHaveBeenCalledWith(
        OTHER,
        expect.objectContaining({ suspendedUntil: null }),
      );
    });

    it('answers 404 for somebody who is not a member', async () => {
      t.repo.findProfile.mockResolvedValue(null);
      await expect(t.service.suspend(admin, OTHER, { duration: '7d' }, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('lifts a suspension and answers 404 when there is none', async () => {
      await expect(t.service.unsuspend(admin, OTHER, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      t.repo.findProfile.mockResolvedValue(profile({ suspendedAt: NOW }));
      await t.service.unsuspend(admin, OTHER, NOW);
      expect(t.repo.updateProfile).toHaveBeenCalledWith(OTHER, {
        suspendedAt: null,
        suspendedUntil: null,
        suspensionReason: null,
      });
    });
  });

  describe('the profile (phase 2)', () => {
    const everything = {
      nickname: 'pier_fan',
      bio: 'Quiet evenings',
      country: 'ES',
      lookingFor: ['CHAT', 'FRIENDS'] as ('CHAT' | 'FRIENDS')[],
      showAge: false,
    };

    it('saves only what the member sent and shows the profile once there is a nickname', async () => {
      const status = await t.service.updateProfile(ME, everything, NOW);
      expect(t.repo.updateProfile).toHaveBeenCalledWith(ME, everything);
      expect(status.profile).toEqual(everything);
    });

    it('has no profile in the status until a nickname is set', async () => {
      const status = await t.service.updateProfile(ME, { bio: 'Hi' }, NOW);
      expect(t.repo.updateProfile).toHaveBeenCalledWith(ME, { bio: 'Hi' });
      expect(status.profile).toBeNull();
    });

    it('refuses a nickname somebody else has with 409, but not my own', async () => {
      t.repo.findProfileByNickname.mockResolvedValue({ userId: OTHER });
      await expect(
        t.service.updateProfile(ME, { nickname: 'pier_fan' }, NOW),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(t.repo.updateProfile).not.toHaveBeenCalled();
      t.repo.findProfileByNickname.mockResolvedValue({ userId: ME });
      await t.service.updateProfile(ME, { nickname: 'pier_fan' }, NOW);
      expect(t.repo.updateProfile).toHaveBeenCalledWith(ME, { nickname: 'pier_fan' });
    });

    it('answers 409 when the unique index settles two people saving the same nickname', async () => {
      t.repo.updateProfile.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
      await expect(
        t.service.updateProfile(ME, { nickname: 'pier_fan' }, NOW),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lets any other error through', async () => {
      t.repo.updateProfile.mockRejectedValue(new Error('db down'));
      await expect(t.service.updateProfile(ME, { bio: 'Hi' }, NOW)).rejects.toThrow('db down');
    });

    it('refuses a bio that shares contact details', async () => {
      await expect(
        t.service.updateProfile(ME, { bio: 'write me on telegram' }, NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(t.repo.updateProfile).not.toHaveBeenCalled();
    });
  });

  describe('reviews and blocks (phase 2)', () => {
    it('leave out the reviews of people blocked either way and name the authors', async () => {
      t.repo.hiddenIds.mockResolvedValue([OTHER]);
      t.repo.reviewsOfSpot.mockResolvedValue({
        items: [
          {
            id: 'r1',
            rating: 4,
            text: null,
            userId: ME,
            nickname: 'pier_fan',
            createdAt: NOW,
            updatedAt: NOW,
          },
          {
            id: 'r2',
            rating: 2,
            text: null,
            userId: '9',
            nickname: null,
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        total: 2,
      });
      const page = await t.service.reviews(ME, SPOT, 1, 20);
      expect(t.repo.reviewsOfSpot).toHaveBeenCalledWith(SPOT, 0, 20, [OTHER]);
      expect(page.items.map((item) => item.author)).toEqual([{ nickname: 'pier_fan' }, null]);
    });

    it('show my own nickname on the review I save', async () => {
      t.repo.findProfile.mockResolvedValue(profile({ nickname: 'pier_fan' }));
      const view = await t.service.saveReview(ME, SPOT, { rating: 5, text: null }, NOW);
      expect(view.author).toEqual({ nickname: 'pier_fan' });
    });
  });

  describe('reports on profiles and conversations (phase 2)', () => {
    const CONVERSATION = '55555555-5555-4555-8555-555555555555';
    const conversation = { id: CONVERSATION, userAId: ME, userBId: OTHER };

    it('reports a profile by nickname', async () => {
      t.repo.findProfileByNickname.mockResolvedValue({ userId: OTHER });
      await t.service.report(ME, { nickname: 'pier_fan', reason: 'HARASSMENT' }, NOW);
      expect(t.repo.findProfileByNickname).toHaveBeenCalledWith('pier_fan');
      expect(t.repo.createReport).toHaveBeenCalledWith(
        expect.objectContaining({
          reporterId: ME,
          targetType: 'PROFILE',
          reportedId: OTHER,
          reason: 'HARASSMENT',
        }),
      );
      expect(t.repo.updateSpot).not.toHaveBeenCalled();
    });

    it('answers 404 for an unknown nickname and for my own', async () => {
      await expect(
        t.service.report(ME, { nickname: 'nobody', reason: 'SPAM' }, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
      t.repo.findProfileByNickname.mockResolvedValue({ userId: ME });
      await expect(
        t.service.report(ME, { nickname: 'me_myself', reason: 'SPAM' }, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(t.repo.createReport).not.toHaveBeenCalled();
    });

    it('emails the team at once for a MINOR report on a profile', async () => {
      t.repo.findProfileByNickname.mockResolvedValue({ userId: OTHER });
      await t.service.report(ME, { nickname: 'pier_fan', reason: 'MINOR' }, NOW);
      await settle();
      expect(t.sent.map((mail) => mail.to)).toEqual(['team@codeqlick.com']);
    });

    it('saves the last 30 messages of a conversation with the report', async () => {
      t.repo.findConversation.mockResolvedValue(conversation);
      t.repo.lastMessages.mockResolvedValue([
        { senderId: OTHER, text: 'Hey', createdAt: NOW },
        { senderId: ME, text: 'Stop', createdAt: new Date(NOW.getTime() + 1000) },
      ]);
      await t.service.report(ME, { conversationId: CONVERSATION, reason: 'HARASSMENT' }, NOW);
      expect(t.repo.lastMessages).toHaveBeenCalledWith(CONVERSATION, 30);
      expect(t.repo.createReport).toHaveBeenCalledWith(
        expect.objectContaining({
          targetType: 'CONVERSATION',
          reportedId: OTHER,
          transcript: [
            { from: 'reported', text: 'Hey', at: NOW.toISOString() },
            { from: 'reporter', text: 'Stop', at: new Date(NOW.getTime() + 1000).toISOString() },
          ],
        }),
      );
    });

    it('reports the other person whichever side I am', async () => {
      t.repo.findConversation.mockResolvedValue({ id: CONVERSATION, userAId: OTHER, userBId: ME });
      await t.service.report(ME, { conversationId: CONVERSATION, reason: 'SPAM' }, NOW);
      expect(t.repo.createReport).toHaveBeenCalledWith(
        expect.objectContaining({ reportedId: OTHER }),
      );
    });

    it('answers 404 for a conversation that is not mine or does not exist', async () => {
      await expect(
        t.service.report(ME, { conversationId: CONVERSATION, reason: 'SPAM' }, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
      t.repo.findConversation.mockResolvedValue({ id: CONVERSATION, userAId: '8', userBId: '9' });
      await expect(
        t.service.report(ME, { conversationId: CONVERSATION, reason: 'SPAM' }, NOW),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(t.repo.createReport).not.toHaveBeenCalled();
    });

    it('lists a profile report for the team with the nicknames and the saved transcript', async () => {
      const person = (id: string, nickname: string | null) => ({
        id,
        name: id,
        email: `${id}@example.com`,
        cruisingProfile: { nickname, suspendedAt: null, suspendedUntil: null },
      });
      (t.repo as Record<string, unknown>).reports = vi.fn().mockResolvedValue([
        {
          id: 'report-1',
          targetType: 'PROFILE',
          reason: 'HARASSMENT',
          details: null,
          transcript: [],
          status: 'OPEN',
          createdAt: NOW,
          reviewedAt: null,
          reviewedBy: null,
          reportedId: OTHER,
          spot: null,
          review: null,
          reporter: person(ME, 'me_myself'),
          reported: person(OTHER, 'pier_fan'),
        },
        {
          id: 'report-2',
          targetType: 'CONVERSATION',
          reason: 'SPAM',
          details: null,
          transcript: [{ from: 'reported', text: 'Hey', at: NOW.toISOString() }],
          status: 'OPEN',
          createdAt: NOW,
          reviewedAt: null,
          reviewedBy: null,
          reportedId: OTHER,
          spot: null,
          review: null,
          reporter: person(ME, null),
          reported: person(OTHER, 'pier_fan'),
        },
      ]);
      (t.repo as Record<string, unknown>).reportCounts = vi
        .fn()
        .mockResolvedValue(new Map([[OTHER, 2]]));
      const [profileReport, conversationReport] = await t.service.reports('OPEN');
      expect(profileReport?.target).toEqual({ type: 'PROFILE', nickname: 'pier_fan' });
      expect(profileReport?.reporter.nickname).toBe('me_myself');
      expect(profileReport?.reported).toMatchObject({ nickname: 'pier_fan', reports: 2 });
      expect(conversationReport?.target).toEqual({ type: 'CONVERSATION' });
      expect(conversationReport?.transcript).toEqual([
        { from: 'reported', text: 'Hey', at: NOW.toISOString() },
      ]);
    });

    it('suspends the person behind a profile report, and their check-in ends', async () => {
      t.repo.findReport.mockResolvedValue({
        id: 'report-1',
        status: 'OPEN',
        targetType: 'PROFILE',
        reason: 'HARASSMENT',
        reportedId: OTHER,
        spot: null,
        review: null,
      });
      await t.service.actOnReport(admin, 'report-1', { remove: true, suspend: '7d' }, NOW);
      expect(t.repo.updateProfile).toHaveBeenCalledWith(
        OTHER,
        expect.objectContaining({ suspendedAt: NOW }),
      );
      expect(t.repo.endCheckIns).toHaveBeenCalledWith(OTHER, NOW);
      expect(t.repo.deleteReview).not.toHaveBeenCalled();
      expect(t.repo.closeReport).toHaveBeenCalledWith('report-1', 'ACTIONED', admin.id, NOW);
    });
  });

  describe('suspensions (phase 2)', () => {
    it('end the check-in of the person suspended', async () => {
      await t.service.suspend(admin, OTHER, { duration: '30d' }, NOW);
      expect(t.repo.endCheckIns).toHaveBeenCalledWith(OTHER, NOW);
    });

    it('list the nickname', async () => {
      (t.repo as Record<string, unknown>).suspendedProfiles = vi.fn().mockResolvedValue([
        {
          nickname: 'pier_fan',
          suspensionReason: 'Spam',
          suspendedUntil: null,
          suspendedAt: NOW,
          user: { id: OTHER, name: 'Pro', email: 'proposer@example.com' },
        },
      ]);
      const [row] = await t.service.suspensions(NOW);
      expect(row).toMatchObject({ userId: OTHER, nickname: 'pier_fan', until: null });
    });
  });

  describe('the team digest', () => {
    it('sends nothing when nothing is waiting', async () => {
      expect(await t.service.sendDigest(NOW)).toBe(false);
      expect(t.sent).toHaveLength(0);
    });

    it('sends the counts once, and at most hourly', async () => {
      t.repo.newestPendingAt.mockResolvedValue(new Date(NOW.getTime() - 60_000));
      expect(await t.service.sendDigest(NOW)).toBe(true);
      await settle();
      expect(t.sent).toHaveLength(1);
      expect(t.sent[0]?.to).toBe('team@codeqlick.com');
      expect(t.sent[0]?.subject).toBe('Cruising: 3 waiting for review');
      expect(t.sent[0]?.text).toContain('https://codeqlick.com/es/admin/cruising');
      // Something newer, but within the hour.
      t.repo.newestPendingAt.mockResolvedValue(new Date(NOW.getTime() + 60_000));
      expect(await t.service.sendDigest(new Date(NOW.getTime() + 30 * 60_000))).toBe(false);
      // After the hour, with something new.
      t.repo.newestPendingAt.mockResolvedValue(new Date(NOW.getTime() + 61 * 60_000));
      expect(await t.service.sendDigest(new Date(NOW.getTime() + 62 * 60_000))).toBe(true);
      // Nothing new since the last one.
      t.repo.newestPendingAt.mockResolvedValue(new Date(NOW.getTime() + 61 * 60_000));
      expect(await t.service.sendDigest(new Date(NOW.getTime() + 130 * 60_000))).toBe(false);
    });

    it('survives a failing query', async () => {
      t.repo.newestPendingAt.mockRejectedValue(new Error('db down'));
      expect(await t.service.sendDigest(NOW)).toBe(false);
    });
  });

  describe('places', () => {
    it('groups cities under countries, most spots first, with the commonest spelling', async () => {
      (t.repo as Record<string, unknown>).liveCityCounts = vi.fn().mockResolvedValue([
        { countryCode: 'ES', citySlug: 'madrid', city: 'Madrid', count: 3 },
        { countryCode: 'ES', citySlug: 'madrid', city: 'madrid', count: 1 },
        { countryCode: 'ES', citySlug: 'malaga', city: 'Málaga', count: 1 },
        { countryCode: 'FR', citySlug: 'nice', city: 'Nice', count: 1 },
      ]);
      expect(await t.service.places()).toEqual({
        countries: [
          {
            countryCode: 'ES',
            count: 5,
            cities: [
              { city: 'Madrid', citySlug: 'madrid', count: 4 },
              { city: 'Málaga', citySlug: 'malaga', count: 1 },
            ],
          },
          { countryCode: 'FR', count: 1, cities: [{ city: 'Nice', citySlug: 'nice', count: 1 }] },
        ],
      });
    });

    it('answers 404 for a city without LIVE spots', async () => {
      (t.repo as Record<string, unknown>).citySpots = vi.fn().mockResolvedValue([]);
      await expect(t.service.cityPage('ES', 'nowhere')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
