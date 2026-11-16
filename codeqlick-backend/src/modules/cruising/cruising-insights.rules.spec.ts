import { describe, expect, it } from 'vitest';
import {
  checkInHourSlots,
  compareReviews,
  contributorBadges,
  decayed,
  emptyWeek,
  importedTags,
  localDayHour,
  scaleWeek,
  spotTagFromLabel,
  spotTimeZone,
  tagsToAmenities,
} from './cruising-insights.rules.js';
import { parseSpotsGeojson } from './cruising.rules.js';
import { bboxQuerySchema, spotSchema } from './cruising.schemas.js';

const at = (iso: string) => new Date(iso);
const hours = (minutes: number) => minutes * 60 * 1000;

describe('spot time zones (decision 89)', () => {
  it('come from the coordinates, offline', () => {
    expect(spotTimeZone(40.41678, -3.70379)).toBe('Europe/Madrid');
    expect(spotTimeZone(28.1, -15.4)).toBe('Atlantic/Canary');
    expect(spotTimeZone(-33.87, 151.21)).toBe('Australia/Sydney');
  });

  it('fall back to UTC when the lookup fails', () => {
    expect(spotTimeZone(Number.NaN, 0)).toBe('UTC');
    expect(spotTimeZone(200, 0)).toBe('UTC');
  });
});

describe('local day and hour', () => {
  it('counts the week from Monday (0) to Sunday (6), in the spot’s clock', () => {
    // Monday 2026-11-16 00:30 UTC is still Sunday evening in New York.
    expect(localDayHour(at('2026-11-16T00:30:00Z'), 'Europe/Madrid')).toEqual({ day: 0, hour: 1 });
    expect(localDayHour(at('2026-11-16T00:30:00Z'), 'America/New_York')).toEqual({
      day: 6,
      hour: 19,
    });
  });

  it('counts an unknown zone in UTC', () => {
    expect(localDayHour(at('2026-11-16T00:30:00Z'), 'Mars/Olympus')).toEqual({ day: 0, hour: 0 });
  });
});

describe('the hours a check-in covers', () => {
  it('are every local hour it overlaps, once', () => {
    // 20:30 to 22:30 in Madrid (UTC+1 in November): 20, 21 and 22 o'clock.
    const start = at('2026-11-18T19:30:00Z');
    expect(
      checkInHourSlots(start, new Date(start.getTime() + hours(120)), 'Europe/Madrid'),
    ).toEqual([
      { day: 2, hour: 20 },
      { day: 2, hour: 21 },
      { day: 2, hour: 22 },
    ]);
  });

  it('start a new day after midnight, and a new week after Sunday', () => {
    // Saturday 23:30 for 2 hours: Saturday 23, Sunday 0 and 1.
    const saturday = at('2026-11-14T22:30:00Z');
    expect(
      checkInHourSlots(saturday, new Date(saturday.getTime() + hours(120)), 'Europe/Madrid'),
    ).toEqual([
      { day: 5, hour: 23 },
      { day: 6, hour: 0 },
      { day: 6, hour: 1 },
    ]);
    // Sunday 23:00 for 1 hour exactly: Sunday 23 only (the end is not covered).
    const sunday = at('2026-11-15T22:00:00Z');
    expect(
      checkInHourSlots(sunday, new Date(sunday.getTime() + hours(60)), 'Europe/Madrid'),
    ).toEqual([{ day: 6, hour: 23 }]);
    // Sunday 23:30 for 1 hour: Sunday 23 and Monday 0.
    const late = at('2026-11-15T22:30:00Z');
    expect(checkInHourSlots(late, new Date(late.getTime() + hours(60)), 'Europe/Madrid')).toEqual([
      { day: 6, hour: 23 },
      { day: 0, hour: 0 },
    ]);
  });

  it('follow the local clock when summer time ends (the repeated hour counts once)', () => {
    // 2026-10-25, Madrid: 03:00 CEST becomes 02:00 CET. From 02:30 CEST for 2 hours: 2 and 3.
    const start = at('2026-10-25T00:30:00Z');
    expect(
      checkInHourSlots(start, new Date(start.getTime() + hours(120)), 'Europe/Madrid'),
    ).toEqual([
      { day: 6, hour: 2 },
      { day: 6, hour: 3 },
    ]);
  });

  it('follow the local clock when summer time starts (the skipped hour is never counted)', () => {
    // 2026-03-29, Madrid: 02:00 CET becomes 03:00 CEST. From 01:30 CET for 1 hour: 1 and 3.
    const start = at('2026-03-29T00:30:00Z');
    expect(checkInHourSlots(start, new Date(start.getTime() + hours(60)), 'Europe/Madrid')).toEqual(
      [
        { day: 6, hour: 1 },
        { day: 6, hour: 3 },
      ],
    );
  });

  it('cover a half-hour zone’s hours like any other', () => {
    // India is UTC+5:30: 12:00 UTC is 17:30 there; 3 hours cover 17, 18, 19 and 20.
    const start = at('2026-11-18T12:00:00Z');
    expect(
      checkInHourSlots(start, new Date(start.getTime() + hours(180)), 'Asia/Kolkata').map(
        (slot) => slot.hour,
      ),
    ).toEqual([17, 18, 19, 20]);
  });

  it('are none for an empty or reversed span', () => {
    const start = at('2026-11-18T12:00:00Z');
    expect(checkInHourSlots(start, start, 'UTC')).toEqual([]);
  });
});

describe('the week chart', () => {
  it('scales against the busiest hour, 0 to 100', () => {
    const week = scaleWeek([
      { day: 0, hour: 20, weight: 4 },
      { day: 0, hour: 21, weight: 2 },
      { day: 6, hour: 1, weight: 1 },
    ]);
    expect(week).toHaveLength(7);
    expect(week[0]).toHaveLength(24);
    expect(week[0]![20]).toBe(100);
    expect(week[0]![21]).toBe(50);
    expect(week[6]![1]).toBe(25);
    expect(week[3]![3]).toBe(0);
  });

  it('is all zeros without weights', () => {
    expect(scaleWeek([])).toEqual(emptyWeek());
    expect(scaleWeek([{ day: 1, hour: 1, weight: 0 }])).toEqual(emptyWeek());
  });

  it('fades by 0.98 a night', () => {
    expect(decayed(100)).toBeCloseTo(98);
    expect(decayed(100, 30)).toBeCloseTo(54.55, 2);
  });
});

describe('spot tags (decision 92)', () => {
  it('are read from the enum or the English or Spanish label, any case or accents', () => {
    expect(spotTagFromLabel('glory_holes')).toBe('GLORY_HOLES');
    expect(spotTagFromLabel('Public transport')).toBe('PUBLIC_TRANSPORT');
    expect(spotTagFromLabel('de dia')).toBe('DAY');
    expect(spotTagFromLabel('CUARTO OSCURO')).toBe('DARKROOM');
    expect(spotTagFromLabel('Pool')).toBeNull();
  });

  it('come from a |-separated cell or an array, unknown ones kept for the checks', () => {
    expect(importedTags('nudist| Lit |')).toEqual(['NUDIST', 'LIT']);
    expect(importedTags(['Nudista', 'parking'])).toEqual(['NUDIST', 'PARKING']);
    expect(importedTags('')).toEqual([]);
    expect(importedTags(undefined)).toEqual([]);
    expect(importedTags('Pool')).toEqual(['Pool']);
    expect(spotSchema.shape.tags.safeParse(importedTags('Pool')).success).toBe(false);
  });

  it('are read from a GeoJSON property too', () => {
    const parsed = parseSpotsGeojson(
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [1, 2] },
            properties: { tags: ['Nudist', 'NIGHT'], 'opening hours': '24h', tips: 'Bring water' },
          },
        ],
      }),
    );
    expect(parsed.ok && parsed.rows[0]?.fields).toMatchObject({
      tags: ['NUDIST', 'NIGHT'],
      openingHours: '24h',
      tips: 'Bring water',
    });
  });

  it('are kept once each, in the list’s order', () => {
    expect(spotSchema.shape.tags.parse(['NIGHT', 'NUDIST', 'NIGHT'])).toEqual(['NUDIST', 'NIGHT']);
  });

  it('filter the map from a comma-separated query', () => {
    const query = bboxQuerySchema.parse({ bbox: '0,0,1,1', tags: 'lit, NUDIST' });
    expect(query.tags).toEqual(['NUDIST', 'LIT']);
    expect(bboxQuerySchema.safeParse({ bbox: '0,0,1,1', tags: 'POOL' }).success).toBe(false);
  });

  it('name the amenities for search engines in English', () => {
    expect(tagsToAmenities(['NUDIST', 'PARKING'])).toEqual(['Nudist', 'Parking']);
  });
});

describe('contributor badges (decision 93)', () => {
  const none = { spotsLive: 0, helpfulReceived: 0, reviewsWritten: 0 };

  it('start at their thresholds', () => {
    expect(contributorBadges(none)).toEqual([]);
    expect(contributorBadges({ ...none, spotsLive: 2 })).toEqual([]);
    expect(contributorBadges({ ...none, spotsLive: 3 })).toEqual(['EXPLORER']);
    expect(contributorBadges({ ...none, helpfulReceived: 9 })).toEqual([]);
    expect(contributorBadges({ ...none, helpfulReceived: 10 })).toEqual(['HELPFUL']);
    expect(contributorBadges({ ...none, reviewsWritten: 24 })).toEqual([]);
    expect(contributorBadges({ ...none, reviewsWritten: 25 })).toEqual(['LOCAL']);
  });

  it('show Guide instead of Explorer from 10 spots', () => {
    expect(contributorBadges({ spotsLive: 10, helpfulReceived: 10, reviewsWritten: 25 })).toEqual([
      'GUIDE',
      'HELPFUL',
      'LOCAL',
    ]);
  });
});

describe('the order of reviews', () => {
  it('is most helpful first, then newest', () => {
    const reviews = [
      { id: 'a', helpful: 0, createdAt: at('2026-11-10T00:00:00Z') },
      { id: 'b', helpful: 2, createdAt: at('2026-11-01T00:00:00Z') },
      { id: 'c', helpful: 0, createdAt: at('2026-11-12T00:00:00Z') },
      { id: 'd', helpful: 2, createdAt: at('2026-11-05T00:00:00Z') },
    ];
    expect(reviews.toSorted(compareReviews).map((review) => review.id)).toEqual([
      'd',
      'b',
      'c',
      'a',
    ]);
  });
});
