import { describe, expect, it } from 'vitest';
import { fillDays } from './umami.client.js';

describe('fillDays', () => {
  it('gives one Madrid day per bar, with zeros where Umami has nothing', () => {
    const endAt = Date.parse('2026-10-15T10:00:00Z');
    const days = fillDays(
      { startAt: endAt - 3 * 86_400_000, endAt },
      3,
      [{ x: '2026-10-15T00:00:00Z', y: 14 }],
      new Map([['2026-10-15T00:00:00Z', 2]]),
    );
    expect(days).toEqual([
      { date: '2026-10-13', pageviews: 0, visitors: 0 },
      { date: '2026-10-14', pageviews: 0, visitors: 0 },
      { date: '2026-10-15', pageviews: 14, visitors: 2 },
    ]);
  });
});
