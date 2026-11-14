import { describe, expect, it } from 'vitest';
import { nextRebuild, type RebuildSchedule } from './cloud-rebuild-schedule.js';

const next = (schedule: Partial<RebuildSchedule>, after: string) =>
  nextRebuild(
    { frequency: 'OFF', minute: null, hour: null, weekday: null, ...schedule },
    new Date(after),
  )?.toISOString() ?? null;

describe('nextRebuild', () => {
  it('is null when the schedule is off', () => {
    expect(next({ frequency: 'OFF' }, '2026-11-14T12:00:00Z')).toBeNull();
  });

  it('runs hourly at its minute, strictly after the instant', () => {
    expect(next({ frequency: 'HOURLY', minute: 15 }, '2026-11-14T12:00:00Z')).toBe(
      '2026-11-14T12:15:00.000Z',
    );
    expect(next({ frequency: 'HOURLY', minute: 15 }, '2026-11-14T12:15:00Z')).toBe(
      '2026-11-14T13:15:00.000Z',
    );
    expect(next({ frequency: 'HOURLY', minute: 0 }, '2026-11-14T23:59:30Z')).toBe(
      '2026-11-15T00:00:00.000Z',
    );
  });

  it('runs hourly every real hour across both clock changes', () => {
    // 29 March 2026: 02:00 CET becomes 03:00 CEST at 01:00 UTC.
    expect(next({ frequency: 'HOURLY', minute: 30 }, '2026-03-29T00:30:00Z')).toBe(
      '2026-03-29T01:30:00.000Z',
    );
    // 25 October 2026: 03:00 CEST becomes 02:00 CET at 01:00 UTC; 02:30 happens twice.
    expect(next({ frequency: 'HOURLY', minute: 30 }, '2026-10-25T00:30:00Z')).toBe(
      '2026-10-25T01:30:00.000Z',
    );
  });

  it('runs daily at a Madrid time, in winter (UTC+1) and in summer (UTC+2)', () => {
    expect(next({ frequency: 'DAILY', hour: 6, minute: 0 }, '2026-11-14T04:00:00Z')).toBe(
      '2026-11-14T05:00:00.000Z',
    );
    expect(next({ frequency: 'DAILY', hour: 6, minute: 0 }, '2026-11-14T05:00:00Z')).toBe(
      '2026-11-15T05:00:00.000Z',
    );
    expect(next({ frequency: 'DAILY', hour: 6, minute: 0 }, '2026-07-01T12:00:00Z')).toBe(
      '2026-07-02T04:00:00.000Z',
    );
    // Late in the Madrid evening it is already the next day in Madrid.
    expect(next({ frequency: 'DAILY', hour: 0, minute: 30 }, '2026-11-14T23:10:00Z')).toBe(
      '2026-11-14T23:30:00.000Z',
    );
  });

  it('handles the day the clocks go forward (29 March 2026)', () => {
    // 06:00 Madrid is 05:00 UTC the day before and 04:00 UTC that day.
    expect(next({ frequency: 'DAILY', hour: 6, minute: 0 }, '2026-03-28T06:00:00Z')).toBe(
      '2026-03-29T04:00:00.000Z',
    );
    // 02:30 doesn't exist that day: it runs at 03:30 CEST, then normally the next day.
    expect(next({ frequency: 'DAILY', hour: 2, minute: 30 }, '2026-03-28T12:00:00Z')).toBe(
      '2026-03-29T01:30:00.000Z',
    );
    expect(next({ frequency: 'DAILY', hour: 2, minute: 30 }, '2026-03-29T01:30:00Z')).toBe(
      '2026-03-30T00:30:00.000Z',
    );
  });

  it('handles the day the clocks go back (25 October 2026)', () => {
    expect(next({ frequency: 'DAILY', hour: 6, minute: 0 }, '2026-10-24T12:00:00Z')).toBe(
      '2026-10-25T05:00:00.000Z',
    );
    // 02:30 happens twice that day: it runs once.
    const first = next({ frequency: 'DAILY', hour: 2, minute: 30 }, '2026-10-24T12:00:00Z');
    expect(first).toBe('2026-10-25T01:30:00.000Z');
    expect(next({ frequency: 'DAILY', hour: 2, minute: 30 }, first!)).toBe(
      '2026-10-26T01:30:00.000Z',
    );
  });

  it('runs weekly on its weekday (1 Monday … 7 Sunday)', () => {
    // Saturday 14 November 2026.
    expect(
      next({ frequency: 'WEEKLY', weekday: 1, hour: 9, minute: 0 }, '2026-11-14T12:00:00Z'),
    ).toBe('2026-11-16T08:00:00.000Z');
    expect(
      next({ frequency: 'WEEKLY', weekday: 6, hour: 14, minute: 0 }, '2026-11-14T12:00:00Z'),
    ).toBe('2026-11-14T13:00:00.000Z');
    // Today's time has passed: a week later.
    expect(
      next({ frequency: 'WEEKLY', weekday: 6, hour: 9, minute: 0 }, '2026-11-14T12:00:00Z'),
    ).toBe('2026-11-21T08:00:00.000Z');
    expect(
      next({ frequency: 'WEEKLY', weekday: 7, hour: 23, minute: 45 }, '2026-11-14T12:00:00Z'),
    ).toBe('2026-11-15T22:45:00.000Z');
  });

  it('runs weekly across both clock changes', () => {
    // Sundays 22 March (UTC+1) → 29 March (UTC+2).
    expect(
      next({ frequency: 'WEEKLY', weekday: 7, hour: 10, minute: 0 }, '2026-03-22T09:00:00Z'),
    ).toBe('2026-03-29T08:00:00.000Z');
    // Sundays 18 October (UTC+2) → 25 October (UTC+1).
    expect(
      next({ frequency: 'WEEKLY', weekday: 7, hour: 10, minute: 0 }, '2026-10-18T08:00:00Z'),
    ).toBe('2026-10-25T09:00:00.000Z');
  });
});
