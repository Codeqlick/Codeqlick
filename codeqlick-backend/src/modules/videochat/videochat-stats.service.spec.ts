import { describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { VideochatStatsRepository } from './videochat-stats.repository.js';
import { addDays, madridDay, VideochatStatsService } from './videochat-stats.service.js';

function service(history: Partial<Awaited<ReturnType<VideochatStatsRepository['history']>>>) {
  const repository = {
    history: vi.fn().mockResolvedValue({
      active: [],
      activeTotal: 0,
      calls: [],
      callTotals: { calls: 0, longCalls: 0, avgDurationSec: null, avgWaitSec: null },
      hours: [],
      members: [],
      reports: [],
      current: { members: 0, openReports: 0, suspended: 0 },
      ...history,
    }),
    logCall: vi.fn().mockResolvedValue(undefined),
    countCall: vi.fn().mockResolvedValue(undefined),
    deleteOlderThan: vi.fn().mockResolvedValue(0),
  };
  const config = { nodeEnv: 'test' } as AppConfigService;
  return {
    repository,
    stats: new VideochatStatsService(repository as unknown as VideochatStatsRepository, config),
  };
}

describe('VideochatStatsService', () => {
  it('counts days in Madrid time', () => {
    // 23:30 UTC on 7 November is already the 8th in Madrid (UTC+1).
    expect(madridDay(new Date('2026-11-07T23:30:00Z'))).toBe('2026-11-08');
    expect(madridDay(new Date('2026-07-01T21:59:00Z'))).toBe('2026-07-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('fills every day of the period, today last, and the 24 hours', async () => {
    const { stats, repository } = service({
      active: [{ date: '2026-11-07', total: 4 }],
      activeTotal: 6,
      calls: [{ date: '2026-11-05', calls: 3, longCalls: 1, avgDurationSec: 70, avgWaitSec: 12 }],
      callTotals: { calls: 3, longCalls: 1, avgDurationSec: 70, avgWaitSec: 12 },
      hours: [{ hour: 22, total: 3 }],
      members: [{ date: '2026-11-01', total: 2 }],
      reports: [{ date: '2026-11-07', total: 1 }],
      current: { members: 10, openReports: 1, suspended: 2 },
    });
    const history = await stats.history(7, new Date('2026-11-07T12:00:00Z'));
    expect(repository.history).toHaveBeenCalledWith('2026-11-01');
    expect(history.days.map((day) => day.date)).toEqual([
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07',
    ]);
    expect(history.days[4]).toMatchObject({ calls: 3, longCalls: 1, avgDurationSec: 70 });
    expect(history.days[6]).toMatchObject({ activeUsers: 4, reports: 1, calls: 0 });
    expect(history.days[0]?.newMembers).toBe(2);
    expect(history.hours).toHaveLength(24);
    expect(history.hours[22]).toBe(3);
    expect(history.totals).toEqual({
      activeUsers: 6,
      newMembers: 2,
      calls: 3,
      longCalls: 1,
      avgDurationSec: 70,
      avgWaitSec: 12,
      reports: 1,
      members: 10,
      openReports: 1,
      suspended: 2,
    });
  });

  it('logs a call in whole seconds', () => {
    const { stats, repository } = service({});
    stats.logCall(1_000, 66_400, 12_600);
    expect(repository.logCall).toHaveBeenCalledWith({
      startedAt: new Date(1_000),
      endedAt: new Date(66_400),
      durationSec: 65,
      waitSec: 13,
    });
    stats.logCall(1_000, 2_000, null);
    expect(repository.logCall).toHaveBeenLastCalledWith(expect.objectContaining({ waitSec: null }));
  });

  it('counts a call for both people, a fast skip only for the one left', () => {
    const { stats, repository } = service({});
    const start = Date.parse('2026-11-08T12:00:00Z');
    stats.countCall(start, start + 4_000, 'skipper', 'skipped');
    expect(repository.countCall).toHaveBeenCalledWith('2026-11-08', [
      { userId: 'skipper', short: true, skippedFast: false },
      { userId: 'skipped', short: true, skippedFast: true },
    ]);
    stats.countCall(start, start + 90_000, 'a', 'b');
    expect(repository.countCall).toHaveBeenLastCalledWith('2026-11-08', [
      { userId: 'a', short: false, skippedFast: false },
      { userId: 'b', short: false, skippedFast: false },
    ]);
  });

  it('deletes usage data older than 180 days', async () => {
    const { stats, repository } = service({});
    await stats.cleanup(new Date('2026-11-07T12:00:00Z'));
    expect(repository.deleteOlderThan).toHaveBeenCalledWith(
      new Date('2026-05-11T12:00:00Z'),
      '2026-05-11',
    );
  });
});
