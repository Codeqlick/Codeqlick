import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CruisingOnboardingService } from './cruising-onboarding.service.js';
import { CruisingStatsService } from './cruising-stats.service.js';

const NOW = new Date('2026-11-18T12:00:00Z');
const ME = '11111111-1111-4111-8111-111111111111';
const VERSION = '2026-11-16';

const emptyData = () => ({
  counts: [] as { metric: string; week: string; total: number }[],
  active: [] as { week: string; total: number }[],
  decisions: [] as { week: string; decided: number; median: number | null }[],
  countrySpots: [{ countryCode: 'ES', count: 4 }],
  citySpots: [{ countryCode: 'ES', citySlug: 'madrid', city: 'Madrid', count: 3 }],
  countryCheckIns: [],
  cityCheckIns: [],
});

describe('CruisingStatsService (decision 101)', () => {
  let repo: { weekly: ReturnType<typeof vi.fn> };
  let service: CruisingStatsService;

  beforeEach(() => {
    repo = { weekly: vi.fn().mockResolvedValue(emptyData()) };
    service = new CruisingStatsService(repo as never);
  });

  it('answers 12 Madrid weeks, zeros where nothing happened', async () => {
    const stats = await service.stats(NOW);
    expect(repo.weekly).toHaveBeenCalledWith('2026-08-31', expect.any(Date), 10);
    const since = repo.weekly.mock.calls[0]![1] as Date;
    expect(NOW.getTime() - since.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(stats.weeks).toHaveLength(12);
    expect(stats.weeks.at(-1)).toEqual({
      start: '2026-11-16',
      members: 0,
      active: 0,
      spots: { pending: 0, live: 0, rejected: 0 },
      checkIns: 0,
      meetups: 0,
      messages: 0,
      roomMessages: 0,
      media: 0,
      reportsOpened: 0,
      reportsDecided: 0,
      medianDecisionHours: null,
      takedowns: 0,
    });
    expect(stats.topCountries.spots).toEqual([{ countryCode: 'ES', count: 4 }]);
    expect(stats.topCities.spots[0]).toMatchObject({ citySlug: 'madrid', count: 3 });
  });

  it('puts each count in its week', async () => {
    repo.weekly.mockResolvedValue({
      ...emptyData(),
      counts: [
        { metric: 'members', week: '2026-11-16', total: 3 },
        { metric: 'spotsLive', week: '2026-11-16', total: 2 },
        { metric: 'spotsPending', week: '2026-11-16', total: 1 },
        { metric: 'spotsRejected', week: '2026-11-09', total: 4 },
        { metric: 'messages', week: '2026-11-09', total: 9 },
        { metric: 'takedowns', week: '2026-08-31', total: 1 },
        // Outside the 12 weeks or unknown: ignored.
        { metric: 'members', week: '2026-08-24', total: 50 },
        { metric: 'whatever', week: '2026-11-16', total: 50 },
      ],
      active: [{ week: '2026-11-16', total: 5 }],
      decisions: [{ week: '2026-11-09', decided: 2, median: 12.345 }],
    });
    const stats = await service.stats(NOW);
    const week = (start: string) => stats.weeks.find((item) => item.start === start)!;
    expect(week('2026-11-16')).toMatchObject({
      members: 3,
      active: 5,
      spots: { pending: 1, live: 2, rejected: 0 },
    });
    expect(week('2026-11-09')).toMatchObject({
      messages: 9,
      spots: { rejected: 4 },
      reportsDecided: 2,
      medianDecisionHours: 12.3,
    });
    expect(week('2026-08-31').takedowns).toBe(1);
    expect(stats.weeks.reduce((sum, item) => sum + item.members, 0)).toBe(3);
  });

  it('keeps the figures 10 minutes', async () => {
    await service.stats(NOW);
    await service.stats(new Date(NOW.getTime() + 9 * 60 * 1000));
    expect(repo.weekly).toHaveBeenCalledTimes(1);
    await service.stats(new Date(NOW.getTime() + 10 * 60 * 1000));
    expect(repo.weekly).toHaveBeenCalledTimes(2);
    service.clearCache();
    await service.stats(new Date(NOW.getTime() + 11 * 60 * 1000));
    expect(repo.weekly).toHaveBeenCalledTimes(3);
  });
});

describe('CruisingOnboardingService (decision 102)', () => {
  const spot = {
    id: 'spot-1',
    slug: 'cove',
    name: 'Cove',
    type: 'BEACH',
    lat: '40.1',
    lng: '-3.2',
    ratingAvg: '4.50',
    ratingCount: 2,
  };
  let repo: { findProfile: ReturnType<typeof vi.fn> };
  let stats: { suggestions: ReturnType<typeof vi.fn> };
  let service: CruisingOnboardingService;

  beforeEach(() => {
    repo = {
      findProfile: vi.fn().mockResolvedValue({ userId: ME, termsVersion: VERSION, country: 'ES' }),
    };
    stats = { suggestions: vi.fn().mockResolvedValue([spot]) };
    service = new CruisingOnboardingService(
      repo as never,
      stats as never,
      {
        cruisingTermsVersion: VERSION,
      } as never,
    );
  });

  it('suggests in my country without a box, as map summaries', async () => {
    const result = await service.suggestions(ME);
    expect(stats.suggestions).toHaveBeenCalledWith({ country: 'ES' }, 12);
    expect(result.items).toEqual([
      {
        id: 'spot-1',
        slug: 'cove',
        name: 'Cove',
        type: 'BEACH',
        lat: 40.1,
        lng: -3.2,
        ratingAvg: 4.5,
        ratingCount: 2,
      },
    ]);
  });

  it('suggests in the box on the grid, and refuses one off it', async () => {
    const box = { minLng: -3.75, minLat: 40, maxLng: -3, maxLat: 40.5 };
    await service.suggestions(ME, box);
    expect(stats.suggestions).toHaveBeenCalledWith({ box }, 12);
    await expect(
      service.suggestions(ME, { minLng: -3.71, minLat: 40, maxLng: -3, maxLat: 40.5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('suggests anywhere without a country, and only to members who entered', async () => {
    repo.findProfile.mockResolvedValue({ userId: ME, termsVersion: VERSION, country: null });
    await service.suggestions(ME);
    expect(stats.suggestions).toHaveBeenCalledWith({ country: undefined }, 12);
    repo.findProfile.mockResolvedValue({ userId: ME, termsVersion: 'old', country: 'ES' });
    await expect(service.suggestions(ME)).rejects.toBeInstanceOf(ForbiddenException);
    repo.findProfile.mockResolvedValue(null);
    await expect(service.suggestions(ME)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
