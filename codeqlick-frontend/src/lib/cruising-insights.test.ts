import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import {
  busiestHourOfDay,
  busiestHours,
  cleanBadges,
  cleanTags,
  CONTRIBUTOR_BADGES,
  hourSpan,
  parseSpotForm,
  parseTagsFilter,
  SPOT_TAGS,
  spotAmenities,
  TAGS_FIELD,
  toSpotInput,
  weekdayName,
} from './cruising';

function form(fields: Record<string, string | string[]>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    for (const each of Array.isArray(value) ? value : [value]) data.append(name, each);
  }
  return data;
}

const GOOD = {
  name: 'Playa del Norte',
  type: 'BEACH',
  lat: '40.4168',
  lng: '-3.7038',
  countryCode: 'ES',
  city: 'Madrid',
  description: 'A quiet stretch of sand, best out of season.',
};

describe('spot tags (decision 92)', () => {
  it('keep the known ones, once, in the catalogue order', () => {
    expect(cleanTags(['NIGHT', 'POOL', 'NUDIST', 'NIGHT'])).toEqual(['NUDIST', 'NIGHT']);
  });

  it('come from the map’s query, any case', () => {
    expect(parseTagsFilter('lit, nudist,POOL')).toEqual(['NUDIST', 'LIT']);
    expect(parseTagsFilter(null)).toEqual([]);
    expect(parseTagsFilter('')).toEqual([]);
  });

  it('are named in both languages', () => {
    for (const tag of SPOT_TAGS) {
      expect(en.Cruising.tags[tag]).toBeTruthy();
      expect(es.Cruising.tags[tag]).toBeTruthy();
    }
  });

  it('are amenities for search engines', () => {
    expect(spotAmenities(['NUDIST', 'PARKING'])).toEqual([
      { '@type': 'LocationFeatureSpecification', name: 'Nudist', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Parking', value: true },
    ]);
  });
});

describe('the spot form’s structured information', () => {
  it('sends the ticked tags, the opening hours and the tips of a new spot', () => {
    const { errors, data } = parseSpotForm(
      form({
        ...GOOD,
        [TAGS_FIELD]: '1',
        tags: ['PARKING', 'NUDIST', 'POOL'],
        openingHours: ' Summer ',
        tips: '',
      }),
    );
    expect(errors).toEqual({});
    expect(data.tags).toEqual(['NUDIST', 'PARKING']);
    expect(data.openingHours).toBe('Summer');
    expect(data).not.toHaveProperty('tips');
    expect(toSpotInput(data)).toMatchObject({
      tags: ['NUDIST', 'PARKING'],
      openingHours: 'Summer',
    });
  });

  it('leaves the tags alone on a form that doesn’t show them, and clears emptied fields in an edit', () => {
    const { data } = parseSpotForm(
      form({ name: 'Renamed spot', openingHours: '', tips: '' }),
      true,
    );
    expect(data).not.toHaveProperty('tags');
    expect(data.openingHours).toBeNull();
    expect(data.tips).toBeNull();
    // No box ticked on a form that shows them: no tags.
    expect(parseSpotForm(form({ [TAGS_FIELD]: '1' }), true).data.tags).toEqual([]);
  });

  it('refuses opening hours or tips past the API’s limits', () => {
    const { errors } = parseSpotForm(
      form({ ...GOOD, openingHours: 'o'.repeat(201), tips: 't'.repeat(501) }),
    );
    expect(errors).toEqual({ openingHours: 'openingHoursLong', tips: 'tipsLong' });
    expect(en.Cruising.spotForm.errors.openingHoursLong).toBeTruthy();
    expect(es.Cruising.spotForm.errors.tipsLong).toBeTruthy();
  });

  it('echoes the ticked tags, one per line, after a failed submit', () => {
    const { values } = parseSpotForm(form({ name: 'x', tags: ['LIT', 'DAY'] }));
    expect(values.tags).toBe('LIT\nDAY');
  });
});

describe('busiest hours (decision 89)', () => {
  const week = () => Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));

  it('names the busiest hours, highest first', () => {
    const days = week();
    days[4]![22] = 100;
    days[5]![23] = 80;
    days[0]![20] = 80;
    days[2]![1] = 10;
    expect(busiestHours(days, 3)).toEqual([
      { day: 4, hour: 22, value: 100 },
      { day: 0, hour: 20, value: 80 },
      { day: 5, hour: 23, value: 80 },
    ]);
    expect(busiestHours(week())).toEqual([]);
  });

  it('finds each day’s busiest hour, or none', () => {
    const day = Array.from({ length: 24 }, () => 0);
    expect(busiestHourOfDay(day)).toBeNull();
    day[21] = 40;
    day[22] = 60;
    expect(busiestHourOfDay(day)).toBe(22);
  });

  it('writes hours as spans and days from Monday', () => {
    expect(hourSpan(9)).toBe('09:00–10:00');
    expect(hourSpan(23)).toBe('23:00–00:00');
    expect(weekdayName(0, 'en')).toBe('Monday');
    expect(weekdayName(6, 'es')).toBe('domingo');
    expect(weekdayName(4, 'en', 'short')).toBe('Fri');
  });
});

describe('contributor badges (decision 93)', () => {
  it('keep the known ones in order', () => {
    expect(cleanBadges(['LOCAL', 'MAYOR', 'EXPLORER'])).toEqual(['EXPLORER', 'LOCAL']);
    expect(cleanBadges(undefined)).toEqual([]);
  });

  it('are named and explained in both languages', () => {
    for (const badge of CONTRIBUTOR_BADGES) {
      expect(en.Cruising.badges[badge].label).toBeTruthy();
      expect(es.Cruising.badges[badge].help).toBeTruthy();
    }
  });
});
