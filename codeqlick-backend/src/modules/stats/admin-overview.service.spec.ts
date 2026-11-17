import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OverviewTotalsRow } from './admin-overview.repository.js';
import { emptyWeek } from './admin-overview.rules.js';
import { AdminOverviewService } from './admin-overview.service.js';

const NOW = new Date('2026-11-18T12:00:00Z');

function totals(over: Partial<OverviewTotalsRow> = {}): OverviewTotalsRow {
  const zero = {
    accounts: 0,
    neoqlickAccounts: 0,
    cruising: 0,
    swipe: 0,
    videochat: 0,
    cloud: 0,
    citas: 0,
    meetings: 0,
    portal: 0,
    cloudProActive: 0,
    cloudProMrr: 0,
    cloudProUnpriced: 0,
    maintenancePaid: 0,
    maintenanceIncluded: 0,
    maintenanceMrr: 0,
    maintenanceUnpriced: 0,
    supportOpen: 0,
    newsletterActive: 0,
    errorsOpen: 0,
    cspOpen: 0,
    monitorsWatched: 0,
    monitorsDown: 0,
    cruisingSpots: 0,
    cruisingReports: 0,
    cruisingMedia: 0,
    cruisingVerifications: 0,
    cruisingTakedowns: 0,
    swipePhotos: 0,
    swipeReports: 0,
    swipeVerifications: 0,
    swipeTakedowns: 0,
    videochatReports: 0,
    videochatAppeals: 0,
    videochatVerifications: 0,
  };
  return { ...zero, ...over };
}

const data = (over: Partial<{ weeks: unknown[]; active: unknown[]; totals: unknown }> = {}) => ({
  weeks: [],
  active: [],
  totals: totals(),
  ...over,
});

describe('AdminOverviewService (decision 122)', () => {
  let repo: { overview: ReturnType<typeof vi.fn> };
  let service: AdminOverviewService;
  const config = {
    cloudHosting: undefined,
    uploadsDir: '/definitely/not/a/folder/of/this/machine',
    cloudDisk: { lowBytes: 30, minBytes: 15 },
  };

  beforeEach(() => {
    repo = { overview: vi.fn().mockResolvedValue(data()) };
    service = new AdminOverviewService(repo as never, config as never);
  });

  it('answers 12 Madrid weeks from the Monday 11 weeks back, zeros where nothing happened', async () => {
    const overview = await service.overview(NOW);
    expect(repo.overview).toHaveBeenCalledWith('2026-08-31');
    expect(overview.generatedAt).toBe(NOW.toISOString());
    expect(overview.weeks.map((week) => week.start)).toEqual([
      '2026-08-31',
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
    ]);
    expect(overview.weeks.at(-1)).toEqual(emptyWeek('2026-11-16'));
    // An unreadable disk is null, not an error.
    expect(overview.health.disk).toBeNull();
  });

  it('puts each count in its week and leaves out other weeks', async () => {
    repo.overview.mockResolvedValue(
      data({
        weeks: [
          { metric: 'accounts', week: '2026-11-16', total: 4, amount: 0 },
          { metric: 'cruising', week: '2026-11-16', total: 2, amount: 0 },
          { metric: 'portal', week: '2026-11-09', total: 1, amount: 0 },
          { metric: 'cloud', week: '2026-11-09', total: 3, amount: 0 },
          { metric: 'purchases', week: '2026-11-09', total: 2, amount: 79_860 },
          { metric: 'leads', week: '2026-08-31', total: 5, amount: 0 },
          { metric: 'supportOpened', week: '2026-11-16', total: 3, amount: 0 },
          { metric: 'supportClosed', week: '2026-11-16', total: 1, amount: 0 },
          { metric: 'deployments', week: '2026-11-16', total: 9, amount: 0 },
          { metric: 'siteChecks', week: '2026-11-02', total: 6, amount: 0 },
          { metric: 'newsletter', week: '2026-11-02', total: 2, amount: 0 },
          // A week outside the 12 (a row written at the edge) and an unknown metric.
          { metric: 'leads', week: '2026-08-24', total: 50, amount: 0 },
          { metric: 'somethingElse', week: '2026-11-16', total: 7, amount: 0 },
        ],
        active: [
          { week: '2026-11-16', total: 3 },
          { week: '2026-08-24', total: 99 },
        ],
      }),
    );
    const { weeks } = await service.overview(NOW);
    const last = weeks.at(-1)!;
    expect(last.accounts).toEqual({ new: 4, active: 3 });
    expect(last.apps.cruising).toBe(2);
    expect(last.support).toEqual({ opened: 3, closed: 1 });
    expect(last.deployments).toBe(9);
    const before = weeks.at(-2)!;
    expect(before.apps).toMatchObject({ portal: 1, cloud: 3 });
    expect(before.purchases).toEqual({ count: 2, amountCents: 79_860 });
    expect(weeks.find((week) => week.start === '2026-11-02')).toMatchObject({
      siteChecks: 6,
      newsletter: 2,
    });
    expect(weeks[0]!.leads).toBe(5);
    expect(weeks.reduce((sum, week) => sum + week.leads, 0)).toBe(5);
  });

  it('adds the MRR up from the stored amounts, in cents', async () => {
    repo.overview.mockResolvedValue(
      data({
        totals: totals({
          cloudProActive: 3,
          cloudProMrr: 5800,
          cloudProUnpriced: 1,
          maintenancePaid: 2,
          maintenanceIncluded: 4,
          maintenanceMrr: 3800,
          maintenanceUnpriced: 0,
        }),
      }),
    );
    const { revenue } = await service.overview(NOW);
    expect(revenue).toEqual({
      currency: 'eur',
      mrrCents: 9600,
      cloudPro: { active: 3, mrrCents: 5800, unpriced: 1 },
      maintenance: { paid: 2, included: 4, mrrCents: 3800, unpriced: 0 },
    });
  });

  it('keeps the answer 10 minutes', async () => {
    const first = await service.overview(NOW);
    const later = await service.overview(new Date(NOW.getTime() + 9 * 60 * 1000));
    expect(later).toBe(first);
    expect(repo.overview).toHaveBeenCalledTimes(1);

    const after = await service.overview(new Date(NOW.getTime() + 10 * 60 * 1000));
    expect(after).not.toBe(first);
    expect(repo.overview).toHaveBeenCalledTimes(2);

    service.clearCache();
    await service.overview(new Date(NOW.getTime() + 11 * 60 * 1000));
    expect(repo.overview).toHaveBeenCalledTimes(3);
  });

  it("reads the disk holding Cloud's folder when it is set up", async () => {
    const withCloud = new AdminOverviewService(
      repo as never,
      { ...config, cloudHosting: { domain: 'x.test', root: process.cwd() } } as never,
    );
    const { health } = await withCloud.overview(NOW);
    expect(health.disk).not.toBeNull();
    expect(health.disk!.totalBytes).toBeGreaterThan(0);
    expect(['ok', 'low', 'full']).toContain(health.disk!.state);
  });
});
