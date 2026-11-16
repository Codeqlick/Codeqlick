import { describe, expect, it } from 'vitest';
import {
  addDays,
  isGridBbox,
  madridDay,
  madridWeekStart,
  roundHours,
  statsWeekStarts,
  TimedCache,
} from './cruising-stats.rules.js';

describe('Cruising statistics rules (decision 101)', () => {
  describe('Madrid weeks', () => {
    it('take the day in Madrid, not in UTC', () => {
      // 23:30 UTC on Sunday is already Monday in Madrid (UTC+1 in winter, +2 in summer).
      expect(madridDay(new Date('2026-11-15T23:30:00Z'))).toBe('2026-11-16');
      expect(madridDay(new Date('2026-07-12T22:30:00Z'))).toBe('2026-07-13');
      expect(madridDay(new Date('2026-11-15T22:59:00Z'))).toBe('2026-11-15');
    });

    it('start on Monday', () => {
      expect(madridWeekStart(new Date('2026-11-16T10:00:00Z'))).toBe('2026-11-16'); // Monday
      expect(madridWeekStart(new Date('2026-11-22T20:00:00Z'))).toBe('2026-11-16'); // Sunday
      // Sunday 23:30 UTC is Monday 00:30 in Madrid: the next week.
      expect(madridWeekStart(new Date('2026-11-22T23:30:00Z'))).toBe('2026-11-23');
      // Across the end of summer time (25 October 2026).
      expect(madridWeekStart(new Date('2026-10-25T12:00:00Z'))).toBe('2026-10-19');
      expect(madridWeekStart(new Date('2026-10-25T23:30:00Z'))).toBe('2026-10-26');
    });

    it('list the last 12 Mondays, oldest first, the current week last', () => {
      const weeks = statsWeekStarts(new Date('2026-11-18T12:00:00Z'));
      expect(weeks).toHaveLength(12);
      expect(weeks.at(-1)).toBe('2026-11-16');
      expect(weeks[0]).toBe('2026-08-31');
      for (let i = 1; i < weeks.length; i++) expect(addDays(weeks[i - 1]!, 7)).toBe(weeks[i]);
      // Across the year's end.
      expect(statsWeekStarts(new Date('2027-01-02T12:00:00Z'), 2)).toEqual([
        '2026-12-21',
        '2026-12-28',
      ]);
    });
  });

  describe('median hours', () => {
    it('round to one decimal and are null with nothing decided', () => {
      expect(roundHours(1.26)).toBe(1.3);
      expect(roundHours(48)).toBe(48);
      expect(roundHours(0.04)).toBe(0);
      expect(roundHours(-1)).toBe(0);
      expect(roundHours(null)).toBeNull();
      expect(roundHours(undefined)).toBeNull();
      expect(roundHours(Number.NaN)).toBeNull();
    });
  });

  describe('the 10-minute cache', () => {
    it('keeps the value until it expires, then forgets it', () => {
      const cache = new TimedCache<number>(10 * 60 * 1000);
      const at = new Date('2026-11-16T10:00:00Z');
      expect(cache.get(at)).toBeNull();
      cache.set(7, at);
      expect(cache.get(new Date(at.getTime() + 9 * 60 * 1000))).toBe(7);
      expect(cache.get(new Date(at.getTime() + 10 * 60 * 1000))).toBeNull();
      cache.set(8, at);
      cache.clear();
      expect(cache.get(at)).toBeNull();
    });
  });
});

describe('onboarding suggestions (decision 102)', () => {
  it('only take boxes on the 0.25° grid', () => {
    expect(isGridBbox({ minLng: -3.75, minLat: 40.25, maxLng: -3.5, maxLat: 40.5 })).toBe(true);
    expect(isGridBbox({ minLng: -180, minLat: -90, maxLng: 180, maxLat: 90 })).toBe(true);
    expect(isGridBbox({ minLng: -3.7, minLat: 40.25, maxLng: -3.5, maxLat: 40.5 })).toBe(false);
    expect(isGridBbox({ minLng: -3.75, minLat: 40.25, maxLng: -3.5, maxLat: 40.41 })).toBe(false);
  });
});
