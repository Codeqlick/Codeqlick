import { describe, expect, it } from 'vitest';
import { freeSlots, madridToUtc, weekdayOf, type Interval, type Weekday } from './booking-time.js';

const none: Record<Weekday, Interval[]> = {
  mon: [],
  tue: [],
  wed: [],
  thu: [],
  fri: [],
  sat: [],
  sun: [],
};

describe('madridToUtc', () => {
  it('uses summer and winter time, across the October change', () => {
    expect(madridToUtc('2026-10-23', '10:00').toISOString()).toBe('2026-10-23T08:00:00.000Z');
    expect(madridToUtc('2026-10-26', '10:00').toISOString()).toBe('2026-10-26T09:00:00.000Z');
  });
});

describe('weekdayOf', () => {
  it('names Madrid days', () => {
    expect(weekdayOf('2026-10-19')).toBe('mon');
    expect(weekdayOf('2026-10-25')).toBe('sun');
  });
});

describe('freeSlots', () => {
  // Thursday 15 October 2026, 18:00 in Madrid.
  const now = new Date('2026-10-15T16:00:00.000Z');

  it('cuts the intervals into calls, after the notice and around booked ones', () => {
    const slots = freeSlots({
      weekly: {
        ...none,
        fri: [{ start: '10:00', end: '11:30' }],
        mon: [{ start: '16:00', end: '17:00' }],
      },
      durationMinutes: 30,
      minNoticeHours: 12,
      horizonDays: 4,
      now,
      booked: [
        {
          startsAt: new Date('2026-10-16T08:30:00.000Z'),
          endsAt: new Date('2026-10-16T09:00:00.000Z'),
        },
      ],
    });
    expect(slots.map((slot) => slot.toISOString())).toEqual([
      // Friday 10:30 is booked; the clocks go back on Sunday, so Monday 16:00 is 15:00 UTC.
      '2026-10-16T08:00:00.000Z',
      '2026-10-16T09:00:00.000Z',
      '2026-10-19T14:00:00.000Z',
      '2026-10-19T14:30:00.000Z',
    ]);
  });

  it('leaves out what falls inside the notice', () => {
    const slots = freeSlots({
      weekly: { ...none, fri: [{ start: '10:00', end: '11:00' }] },
      durationMinutes: 30,
      minNoticeHours: 48,
      horizonDays: 2,
      now,
      booked: [],
    });
    expect(slots).toEqual([]);
  });
});
