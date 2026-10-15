import { describe, expect, it } from 'vitest';
import { digestWeekStart } from './digest-schedule.js';

describe('digestWeekStart', () => {
  it('is Monday 08:00 Madrid time, in summer (UTC+2) and in winter (UTC+1)', () => {
    // Wednesday 15 October 2026 → Monday 12 October, 06:00 UTC.
    expect(digestWeekStart(new Date('2026-10-15T12:00:00Z')).toISOString()).toBe(
      '2026-10-12T06:00:00.000Z',
    );
    // Wednesday 4 November 2026 → Monday 2 November, 07:00 UTC.
    expect(digestWeekStart(new Date('2026-11-04T12:00:00Z')).toISOString()).toBe(
      '2026-11-02T07:00:00.000Z',
    );
  });

  it('on a Monday before 08:00 it is still last week', () => {
    expect(digestWeekStart(new Date('2026-10-12T05:30:00Z')).toISOString()).toBe(
      '2026-10-05T06:00:00.000Z',
    );
    expect(digestWeekStart(new Date('2026-10-12T06:00:00Z')).toISOString()).toBe(
      '2026-10-12T06:00:00.000Z',
    );
  });

  it('handles the week the clocks go back (Sunday 25 October 2026)', () => {
    expect(digestWeekStart(new Date('2026-10-26T08:00:00Z')).toISOString()).toBe(
      '2026-10-26T07:00:00.000Z',
    );
    expect(digestWeekStart(new Date('2026-10-25T23:00:00Z')).toISOString()).toBe(
      '2026-10-19T06:00:00.000Z',
    );
  });
});
