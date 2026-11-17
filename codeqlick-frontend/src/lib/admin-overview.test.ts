import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import {
  diskUsedPercent,
  moderationWaiting,
  overviewWeekLabels,
  sumWeeks,
  unpricedSubscriptions,
  type AdminOverview,
  type OverviewWeek,
} from './admin-overview';

const week = (start: string, leads: number, amountCents = 0): OverviewWeek => ({
  start,
  accounts: { new: 0, active: 0 },
  apps: { cruising: 0, swipe: 0, videochat: 0, cloud: 0, citas: 0, meetings: 0, portal: 0 },
  purchases: { count: amountCents > 0 ? 1 : 0, amountCents },
  leads,
  support: { opened: 0, closed: 0 },
  deployments: 0,
  siteChecks: 0,
  newsletter: 0,
});

describe('Admin overview (decision 122)', () => {
  it('labels each week by its Monday, short on the axis and in full for the tables', () => {
    const { labels, longLabels } = overviewWeekLabels(['2026-11-09', '2026-11-16'], 'en-GB');
    expect(labels).toEqual(['09/11', '16/11']);
    expect(longLabels).toEqual(['9 Nov 2026', '16 Nov 2026']);
    // The Monday stays the Monday wherever the server runs.
    expect(overviewWeekLabels(['2026-01-05'], 'es').longLabels[0]).toContain('5');
  });

  it('adds a weekly figure up over the weeks', () => {
    const weeks = [week('2026-11-09', 2, 39_930), week('2026-11-16', 3, 19_965)];
    expect(sumWeeks(weeks, (item) => item.leads)).toBe(5);
    expect(sumWeeks(weeks, (item) => item.purchases.amountCents)).toBe(59_895);
    expect(sumWeeks([], (item) => item.leads)).toBe(0);
  });

  it('works out the used share of the disk', () => {
    expect(diskUsedPercent({ totalBytes: 100, freeBytes: 25 })).toBe(75);
    expect(diskUsedPercent({ totalBytes: 3, freeBytes: 2 })).toBe(33);
    expect(diskUsedPercent({ totalBytes: 0, freeBytes: 0 })).toBe(0);
    expect(diskUsedPercent({ totalBytes: 100, freeBytes: 120 })).toBe(0);
  });

  it('counts everything waiting for a moderator and the unpriced subscriptions', () => {
    const moderation: AdminOverview['health']['moderation'] = {
      cruising: { spots: 1, reports: 2, media: 3, verifications: 0, takedowns: 1 },
      swipe: { photos: 4, reports: 0, verifications: 1, takedowns: 0 },
      videochat: { reports: 2, appeals: 1, verifications: 0 },
    };
    expect(moderationWaiting(moderation)).toBe(15);
    expect(
      unpricedSubscriptions({
        currency: 'eur',
        mrrCents: 0,
        cloudPro: { active: 2, mrrCents: 0, unpriced: 2 },
        maintenance: { paid: 1, included: 0, mrrCents: 0, unpriced: 1 },
      }),
    ).toBe(3);
  });

  it('has the same texts in English and Spanish', () => {
    const keys = (value: unknown, prefix = ''): string[] =>
      value && typeof value === 'object'
        ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`))
        : [prefix];
    expect(keys(es.AdminOverview).toSorted()).toEqual(keys(en.AdminOverview).toSorted());
    expect(es.Admin.nav.overview).toBeTruthy();
    expect(en.Admin.nav.overview).toBeTruthy();
  });
});
