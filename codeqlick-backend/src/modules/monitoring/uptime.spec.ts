import { describe, expect, it } from 'vitest';
import { dailyUptime, uptimeRatio } from './uptime.js';

describe('dailyUptime', () => {
  it('groups checks by Madrid day, oldest first, with empty days', () => {
    const now = new Date('2026-10-16T10:00:00.000Z');
    const checks = [
      // 23:30 UTC on the 14th is already the 15th in Madrid.
      { checkedAt: new Date('2026-10-14T23:30:00.000Z'), ok: false },
      { checkedAt: new Date('2026-10-15T08:00:00.000Z'), ok: true },
      { checkedAt: new Date('2026-10-15T08:05:00.000Z'), ok: true },
      { checkedAt: new Date('2026-10-15T08:10:00.000Z'), ok: true },
      { checkedAt: new Date('2026-10-16T09:00:00.000Z'), ok: true },
    ];
    expect(dailyUptime(checks, 3, now)).toEqual([
      { day: '2026-10-14', checks: 0, ratio: null },
      { day: '2026-10-15', checks: 4, ratio: 0.75 },
      { day: '2026-10-16', checks: 1, ratio: 1 },
    ]);
  });
});

describe('uptimeRatio', () => {
  it('is the share of good checks', () => {
    expect(uptimeRatio([{ ok: true }, { ok: true }, { ok: false }, { ok: true }])).toBe(0.75);
    expect(uptimeRatio([])).toBeNull();
  });
});
