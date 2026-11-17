import { describe, expect, it } from 'vitest';
import { madridWeekStart, statsWeekStarts, TimedCache } from './stats-weeks.js';

describe('stats weeks (Europe/Madrid, Monday)', () => {
  it('buckets an instant into its Madrid Monday', () => {
    // Monday 00:30 in Madrid (winter, UTC+1) is still Sunday in UTC.
    expect(madridWeekStart(new Date('2026-11-15T23:30:00Z'))).toBe('2026-11-16');
    // Sunday 23:30 in Madrid belongs to the week before.
    expect(madridWeekStart(new Date('2026-11-22T22:30:00Z'))).toBe('2026-11-16');
    // Summer time (UTC+2): Monday 01:00 in Madrid is Sunday 23:00 UTC.
    expect(madridWeekStart(new Date('2026-07-12T23:00:00Z'))).toBe('2026-07-13');
  });

  it('lists 12 Mondays, oldest first, across the change of time', () => {
    const starts = statsWeekStarts(new Date('2026-11-18T12:00:00Z'));
    expect(starts).toHaveLength(12);
    expect(starts[0]).toBe('2026-08-31');
    expect(starts.at(-1)).toBe('2026-11-16');
    // Every step is exactly 7 days, also over the end of summer time (25 October).
    for (let index = 1; index < starts.length; index += 1) {
      const gap =
        Date.parse(`${starts[index]}T00:00:00Z`) - Date.parse(`${starts[index - 1]}T00:00:00Z`);
      expect(gap).toBe(7 * 24 * 60 * 60 * 1000);
    }
    expect(statsWeekStarts(new Date('2026-11-18T12:00:00Z'), 2)).toEqual([
      '2026-11-09',
      '2026-11-16',
    ]);
  });
});

describe('TimedCache', () => {
  it('keeps a value until its time is up', () => {
    const cache = new TimedCache<number>(1000);
    const start = new Date('2026-11-18T12:00:00Z');
    expect(cache.get(start)).toBeNull();
    cache.set(42, start);
    expect(cache.get(new Date(start.getTime() + 999))).toBe(42);
    expect(cache.get(new Date(start.getTime() + 1000))).toBeNull();
    cache.set(7, start);
    cache.clear();
    expect(cache.get(start)).toBeNull();
  });
});
