import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CruisingInsightsService } from './cruising-insights.service.js';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SPOT = '33333333-3333-4333-8333-333333333333';
const REVIEW = '44444444-4444-4444-8444-444444444444';
const VERSION = '2026-11-16';
const NOW = new Date('2026-11-16T12:00:00Z');

const profile = (over: Record<string, unknown> = {}) => ({
  userId: ME,
  termsVersion: VERSION,
  suspendedAt: null,
  suspendedUntil: null,
  nickname: 'me_myself',
  ...over,
});

const review = (over: Record<string, unknown> = {}) => ({
  id: REVIEW,
  userId: OTHER,
  status: 'LIVE',
  spot: { id: SPOT, slug: 'cove', name: 'Cove', status: 'LIVE' },
  ...over,
});

function build() {
  const repo = {
    findProfile: vi.fn().mockResolvedValue(profile()),
    findSpot: vi.fn().mockResolvedValue({ id: SPOT, status: 'LIVE' }),
    spotHours: vi.fn().mockResolvedValue({ rows: [], checkIns: 0 }),
    findReviewById: vi.fn().mockResolvedValue(review()),
    hiddenIds: vi.fn().mockResolvedValue([]),
    addHelpfulVote: vi.fn().mockResolvedValue(undefined),
    removeHelpfulVote: vi.fn().mockResolvedValue(undefined),
  };
  const config = { cruisingTermsVersion: VERSION };
  return { repo, service: new CruisingInsightsService(repo as never, config as never) };
}

describe('CruisingInsightsService', () => {
  let t: ReturnType<typeof build>;
  beforeEach(() => {
    t = build();
  });

  describe('busiest hours (decision 89)', () => {
    it('are not ready under 10 check-ins, and say nothing then', async () => {
      t.repo.spotHours.mockResolvedValue({ rows: [{ day: 0, hour: 1, weight: 9 }], checkIns: 9 });
      const result = await t.service.hours(ME, SPOT);
      expect(result.ready).toBe(false);
      expect(result.days.flat().every((value) => value === 0)).toBe(true);
    });

    it('show the week scaled from 10 check-ins', async () => {
      t.repo.spotHours.mockResolvedValue({
        rows: [
          { day: 4, hour: 22, weight: 8 },
          { day: 4, hour: 23, weight: 2 },
        ],
        checkIns: 10,
      });
      const result = await t.service.hours(ME, SPOT);
      expect(result.ready).toBe(true);
      expect(result.days[4]![22]).toBe(100);
      expect(result.days[4]![23]).toBe(25);
    });

    it('need entry and a LIVE spot', async () => {
      t.repo.findProfile.mockResolvedValue(null);
      await expect(t.service.hours(ME, SPOT)).rejects.toBeInstanceOf(ForbiddenException);
      t.repo.findProfile.mockResolvedValue(profile());
      t.repo.findSpot.mockResolvedValue({ id: SPOT, status: 'HIDDEN' });
      await expect(t.service.hours(ME, SPOT)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('helpful votes (decision 93)', () => {
    it('are saved for the author’s counters', async () => {
      await t.service.markHelpful(ME, REVIEW, NOW);
      expect(t.repo.addHelpfulVote).toHaveBeenCalledWith(REVIEW, ME, OTHER, NOW);
    });

    it('are refused on my own review', async () => {
      t.repo.findReviewById.mockResolvedValue(review({ userId: ME }));
      await expect(t.service.markHelpful(ME, REVIEW, NOW)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(t.repo.addHelpfulVote).not.toHaveBeenCalled();
    });

    it('answer 404 for a hidden review or spot, or a blocked author', async () => {
      for (const found of [
        null,
        review({ status: 'HIDDEN' }),
        review({ spot: { id: SPOT, status: 'HIDDEN' } }),
      ]) {
        t.repo.findReviewById.mockResolvedValue(found);
        await expect(t.service.markHelpful(ME, REVIEW, NOW)).rejects.toBeInstanceOf(
          NotFoundException,
        );
      }
      t.repo.findReviewById.mockResolvedValue(review());
      t.repo.hiddenIds.mockResolvedValue([OTHER]);
      await expect(t.service.markHelpful(ME, REVIEW, NOW)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('need entry and an account that is not suspended', async () => {
      t.repo.findProfile.mockResolvedValue(profile({ termsVersion: 'old' }));
      await expect(t.service.markHelpful(ME, REVIEW, NOW)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      t.repo.findProfile.mockResolvedValue(profile({ suspendedAt: NOW }));
      await expect(t.service.markHelpful(ME, REVIEW, NOW)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('can be taken back', async () => {
      await t.service.unmarkHelpful(ME, REVIEW);
      expect(t.repo.removeHelpfulVote).toHaveBeenCalledWith(REVIEW, ME, OTHER);
      t.repo.findReviewById.mockResolvedValue(null);
      await expect(t.service.unmarkHelpful(ME, REVIEW)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
