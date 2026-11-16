import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import { PROTECTED_PATH } from './auth/constants';
import {
  ageOf,
  alertCounts,
  alertsEndpoint,
  COMMUNITY_REPORT_REASONS,
  formatTripDay,
  isSafetyKind,
  parseMeetupForm,
  reportedCommunityTarget,
  SAFETY_KINDS,
  shiftDay,
  todayUtc,
  tripDatesError,
} from './cruising-community';

const NOW = new Date('2026-11-16T12:00:00Z');
const inHours = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000).toISOString();

describe('the meetup form (decision 88)', () => {
  const form = (over: Record<string, unknown> = {}) => ({
    startsAt: inHours(3),
    hours: '2',
    title: '  Sunset walk ',
    description: '',
    capacity: '',
    ...over,
  });

  it('takes a valid meetup with no capacity', () => {
    expect(parseMeetupForm(form(), NOW)).toEqual({
      value: {
        startsAt: inHours(3),
        hours: 2,
        title: 'Sunset walk',
        description: '',
        capacity: null,
      },
      errors: {},
    });
  });

  it('refuses times, durations, titles and capacities out of range', () => {
    expect(parseMeetupForm(form({ startsAt: '' }), NOW).errors.startsAt).toBe('startsAt');
    expect(parseMeetupForm(form({ startsAt: inHours(0.25) }), NOW).errors.startsAt).toBe('tooSoon');
    expect(parseMeetupForm(form({ startsAt: inHours(31 * 24) }), NOW).errors.startsAt).toBe(
      'tooFar',
    );
    expect(parseMeetupForm(form({ hours: '5' }), NOW).errors.hours).toBe('hours');
    expect(parseMeetupForm(form({ title: 'ab' }), NOW).errors.title).toBe('title');
    expect(parseMeetupForm(form({ description: 'x'.repeat(501) }), NOW).errors.description).toBe(
      'description',
    );
    expect(parseMeetupForm(form({ capacity: '1' }), NOW).errors.capacity).toBe('capacity');
    expect(parseMeetupForm(form({ capacity: '51' }), NOW).errors.capacity).toBe('capacity');
    expect(parseMeetupForm(form({ capacity: '2.5' }), NOW).errors.capacity).toBe('capacity');
    expect(parseMeetupForm(form({ capacity: '50' }), NOW).value?.capacity).toBe(50);
  });
});

describe('trip dates (decision 90)', () => {
  it('counts in UTC days', () => {
    expect(todayUtc(NOW)).toBe('2026-11-16');
    expect(shiftDay('2026-11-16', 60)).toBe('2027-01-15');
    expect(formatTripDay('2026-11-20', 'en')).toBe('20 Nov');
  });

  it('starts today to 60 days ahead and lasts up to 14 days', () => {
    expect(tripDatesError('2026-11-16', '2026-11-16', NOW)).toBeNull();
    expect(tripDatesError('nope', '2026-11-16', NOW)).toBe('dates');
    expect(tripDatesError('2026-11-15', '2026-11-17', NOW)).toBe('past');
    expect(tripDatesError('2027-01-16', '2027-01-17', NOW)).toBe('tooFar');
    expect(tripDatesError('2026-11-20', '2026-11-19', NOW)).toBe('order');
    expect(tripDatesError('2026-11-20', '2026-12-03', NOW)).toBeNull();
    expect(tripDatesError('2026-11-20', '2026-12-04', NOW)).toBe('tooLong');
  });
});

describe('safety alerts (decision 91)', () => {
  it('knows the kinds and has a label for each in both languages', () => {
    expect(isSafetyKind('POLICE')).toBe(true);
    expect(isSafetyKind('FIRE')).toBe(false);
    for (const kind of SAFETY_KINDS) {
      expect(en.Cruising.safety.kinds[kind]).toBeTruthy();
      expect(es.Cruising.safety.kinds[kind]).toBeTruthy();
    }
  });

  it('says how old an alert is', () => {
    expect(ageOf(inHours(-0.5), NOW)).toEqual({ unit: 'minutes', count: 30 });
    expect(ageOf(inHours(-5), NOW)).toEqual({ unit: 'hours', count: 5 });
    expect(ageOf(inHours(-72), NOW)).toEqual({ unit: 'days', count: 3 });
    expect(ageOf(inHours(1), NOW)).toEqual({ unit: 'minutes', count: 0 });
  });

  it('merges the grid cells of the map and asks a private route', () => {
    expect(
      alertCounts([
        { items: [{ spotId: 'a', alerts: 1 }] },
        { items: [{ spotId: 'b', alerts: 2 }] },
      ]),
    ).toEqual(
      new Map([
        ['a', 1],
        ['b', 2],
      ]),
    );
    expect(alertsEndpoint('es', true)).toBe('/es/api/alerts');
    expect(alertsEndpoint('en', false)).toBe('/en/cruising/api/alerts');
  });
});

describe('reports and pages', () => {
  it('reads a reported meetup or alert for the team', () => {
    expect(
      reportedCommunityTarget({
        type: 'MEETUP',
        meetup: { title: 'Walk', description: 'Bring water', spot: { name: 'Cove', slug: 'cove' } },
      }),
    ).toEqual({
      title: 'Walk',
      text: 'Bring water',
      kind: null,
      spotName: 'Cove',
      spotSlug: 'cove',
    });
    expect(
      reportedCommunityTarget({ type: 'ALERT', alert: { kind: 'THEFT', note: null } }),
    ).toEqual({ title: null, text: null, kind: 'THEFT', spotName: null, spotSlug: null });
    expect(reportedCommunityTarget(null).title).toBeNull();
    expect(COMMUNITY_REPORT_REASONS).not.toContain('WRONG_INFO');
  });

  it('keeps meetups and trips behind the account', () => {
    expect(PROTECTED_PATH.test('/en/cruising/meetups')).toBe(true);
    expect(PROTECTED_PATH.test('/es/cruising/trips')).toBe(true);
  });

  it('has the same phase 5 texts in both languages', () => {
    for (const group of ['meetups', 'trips', 'safety'] as const) {
      expect(Object.keys(es.Cruising[group]).toSorted()).toEqual(
        Object.keys(en.Cruising[group]).toSorted(),
      );
    }
    expect(en.AdminCruising.targets.MEETUP).toBeTruthy();
    expect(es.AdminCruising.targets.ALERT).toBeTruthy();
  });
});
