import { describe, expect, it, vi } from 'vitest';
import type { StatsRepository } from './stats.repository.js';
import { StatsService, lastMonths } from './stats.service.js';

describe('lastMonths', () => {
  it('counts back from the current Madrid month, across a year boundary', () => {
    expect(lastMonths(3, new Date('2026-02-10T12:00:00Z'))).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('uses Madrid time: 23:30 UTC on 31 October is already November there', () => {
    expect(lastMonths(1, new Date('2026-10-31T23:30:00Z'))).toEqual(['2026-11']);
  });
});

describe('StatsService.timeline', () => {
  it('returns every month, with zeros where nothing happened', async () => {
    const monthly = vi
      .fn()
      .mockResolvedValue([{ month: '2026-09', leads: 4, leadsWon: 1, posts: 2, caseStudies: 0 }]);
    const service = new StatsService({ monthly } as unknown as StatsRepository);

    const result = await service.timeline(3, new Date('2026-10-14T12:00:00Z'));

    expect(result.months).toEqual([
      { month: '2026-08', leads: 0, leadsWon: 0, posts: 0, caseStudies: 0 },
      { month: '2026-09', leads: 4, leadsWon: 1, posts: 2, caseStudies: 0 },
      { month: '2026-10', leads: 0, leadsWon: 0, posts: 0, caseStudies: 0 },
    ]);
    // Queried from a day before the first month, to cover Madrid's earlier midnight.
    const [since] = monthly.mock.calls[0] as [Date];
    expect(since.toISOString()).toBe('2026-07-31T00:00:00.000Z');
  });
});
