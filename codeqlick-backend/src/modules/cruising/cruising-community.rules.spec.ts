import { describe, expect, it } from 'vitest';
import {
  addDays,
  confirmedExpiry,
  formatDay,
  goneEnds,
  meetupEnd,
  meetupHasRoom,
  meetupIsOver,
  meetupTimeProblem,
  parseDay,
  safetyActive,
  safetyExpiry,
  tripDatesProblem,
  tripsOverBefore,
  utcDay,
} from './cruising-community.rules.js';
import { meetupSchema, safetyAlertSchema, tripSchema } from './cruising-community.schemas.js';
import { pushPayload } from './cruising.rules.js';
import { reportSchema } from './cruising.schemas.js';

const NOW = new Date('2026-11-16T12:00:00Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60 * 1000);
const hours = (n: number) => minutes(n * 60);

describe('meetup times (decision 88)', () => {
  it('starts between 30 minutes and 30 days ahead', () => {
    expect(meetupTimeProblem(minutes(29), 2, NOW)).toBe('too-soon');
    expect(meetupTimeProblem(minutes(30), 2, NOW)).toBeNull();
    expect(meetupTimeProblem(hours(30 * 24), 2, NOW)).toBeNull();
    expect(meetupTimeProblem(minutes(30 * 24 * 60 + 1), 2, NOW)).toBe('too-far');
    expect(meetupTimeProblem(minutes(-60), 2, NOW)).toBe('too-soon');
  });

  it('lasts 1 to 4 whole hours', () => {
    expect(meetupTimeProblem(hours(2), 0, NOW)).toBe('duration');
    expect(meetupTimeProblem(hours(2), 1, NOW)).toBeNull();
    expect(meetupTimeProblem(hours(2), 4, NOW)).toBeNull();
    expect(meetupTimeProblem(hours(2), 5, NOW)).toBe('duration');
    expect(meetupTimeProblem(hours(2), 1.5, NOW)).toBe('duration');
    expect(meetupEnd(hours(2), 3)).toEqual(hours(5));
  });

  it('has room until the capacity, and none to join once over', () => {
    expect(meetupHasRoom(null, 500)).toBe(true);
    expect(meetupHasRoom(2, 1)).toBe(true);
    expect(meetupHasRoom(2, 2)).toBe(false);
    expect(meetupIsOver(hours(1), NOW)).toBe(false);
    expect(meetupIsOver(NOW, NOW)).toBe(true);
  });

  it('validates the fields of a new meetup', () => {
    const base = {
      spotId: '33333333-3333-4333-8333-333333333333',
      startsAt: hours(3).toISOString(),
      hours: 2,
      title: 'Sunset walk',
    };
    expect(meetupSchema.safeParse(base).success).toBe(true);
    expect(meetupSchema.parse(base).description).toBe('');
    expect(meetupSchema.safeParse({ ...base, title: 'x'.repeat(81) }).success).toBe(false);
    expect(meetupSchema.safeParse({ ...base, description: 'x'.repeat(501) }).success).toBe(false);
    expect(meetupSchema.safeParse({ ...base, capacity: 1 }).success).toBe(false);
    expect(meetupSchema.safeParse({ ...base, capacity: 51 }).success).toBe(false);
    expect(meetupSchema.safeParse({ ...base, capacity: 50 }).success).toBe(true);
    expect(meetupSchema.safeParse({ ...base, hours: 5 }).success).toBe(false);
  });
});

describe('trip dates (decision 90)', () => {
  const today = utcDay(NOW);

  it('works in whole UTC days', () => {
    expect(formatDay(today)).toBe('2026-11-16');
    expect(parseDay('2026-11-20')).toEqual(new Date('2026-11-20T00:00:00Z'));
    expect(formatDay(addDays(today, 60))).toBe('2027-01-15');
  });

  it('starts today to 60 days ahead and lasts up to 14 days, both ends included', () => {
    expect(tripDatesProblem(addDays(today, -1), today, NOW)).toBe('past');
    expect(tripDatesProblem(today, today, NOW)).toBeNull();
    expect(tripDatesProblem(addDays(today, 60), addDays(today, 61), NOW)).toBeNull();
    expect(tripDatesProblem(addDays(today, 61), addDays(today, 62), NOW)).toBe('too-far');
    expect(tripDatesProblem(addDays(today, 5), addDays(today, 4), NOW)).toBe('order');
    expect(tripDatesProblem(today, addDays(today, 13), NOW)).toBeNull();
    expect(tripDatesProblem(today, addDays(today, 14), NOW)).toBe('too-long');
  });

  it('is over the day after its last day', () => {
    expect(tripsOverBefore(new Date('2026-11-17T00:30:00Z'))).toEqual(
      new Date('2026-11-17T00:00:00Z'),
    );
  });

  it('validates the fields of a new trip', () => {
    const base = { countryCode: 'ES', citySlug: 'madrid', from: '2026-11-20', to: '2026-11-22' };
    expect(tripSchema.parse(base).listed).toBe(true);
    expect(tripSchema.safeParse({ ...base, countryCode: 'XX' }).success).toBe(false);
    expect(tripSchema.safeParse({ ...base, from: '20-11-2026' }).success).toBe(false);
  });
});

describe('safety alerts (decision 91)', () => {
  it('lasts 6 hours, a closed place 7 days', () => {
    expect(safetyExpiry('POLICE', NOW)).toEqual(hours(6));
    expect(safetyExpiry('CLOSED', NOW)).toEqual(hours(7 * 24));
  });

  it('gains 3 hours a confirmation, up to 24 hours from its creation', () => {
    let expires = hours(6);
    expires = confirmedExpiry(NOW, expires);
    expect(expires).toEqual(hours(9));
    for (let i = 0; i < 10; i += 1) expires = confirmedExpiry(NOW, expires);
    expect(expires).toEqual(hours(24));
    // A closed place's 7 days are never shortened.
    expect(confirmedExpiry(NOW, hours(7 * 24))).toEqual(hours(7 * 24));
  });

  it('ends with three "gone"', () => {
    expect(goneEnds(2)).toBe(false);
    expect(goneEnds(3)).toBe(true);
  });

  it('is active until it expires, unless a report hid it', () => {
    expect(safetyActive({ expiresAt: hours(1), hidden: false }, NOW)).toBe(true);
    expect(safetyActive({ expiresAt: hours(1), hidden: true }, NOW)).toBe(false);
    expect(safetyActive({ expiresAt: NOW, hidden: false }, NOW)).toBe(false);
  });

  it('takes a known kind and a note up to 200 characters', () => {
    expect(safetyAlertSchema.parse({ kind: 'THEFT' }).note).toBeNull();
    expect(safetyAlertSchema.safeParse({ kind: 'FIRE' }).success).toBe(false);
    expect(safetyAlertSchema.safeParse({ kind: 'OTHER', note: 'x'.repeat(201) }).success).toBe(
      false,
    );
  });
});

describe('phase 5 notifications and reports', () => {
  it('names neither the spot nor a person', () => {
    expect(pushPayload('meetup', 'en')).toEqual({
      title: 'Cruising',
      body: 'A meetup was planned at one of your favourite spots',
      url: '/en/meetups',
      tag: 'cruising-meetup',
    });
    expect(pushPayload('safety', 'en').body).toBe('Safety alert at one of your favourite spots');
    expect(pushPayload('safety', 'es').url).toBe('/es/favorites');
    expect(pushPayload('meetup-cancelled', 'en').body).toBe('A meetup you joined was cancelled');
  });

  it('reports a meetup or an alert, one target only', () => {
    const id = '44444444-4444-4444-8444-444444444444';
    expect(reportSchema.safeParse({ meetupId: id, reason: 'SPAM' }).success).toBe(true);
    expect(reportSchema.safeParse({ alertId: id, reason: 'OTHER' }).success).toBe(true);
    expect(reportSchema.safeParse({ meetupId: id, alertId: id, reason: 'SPAM' }).success).toBe(
      false,
    );
  });
});
