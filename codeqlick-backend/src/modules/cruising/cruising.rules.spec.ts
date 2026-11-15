import { describe, expect, it } from 'vitest';
import {
  citySlugOf,
  extractSpotSlug,
  isSuspended,
  memberCanChange,
  nextSpotStatus,
  parseBbox,
  roundCoordinate,
  roundRating,
  slugify,
  spotSlugBase,
  summarizeRatings,
  uniqueSlug,
} from './cruising.rules.js';

describe('slugs', () => {
  it('makes lower-case ASCII words joined by hyphens', () => {
    expect(slugify('Playa del Inglés')).toBe('playa-del-ingles');
    expect(slugify('  Parque  Güell!! ')).toBe('parque-guell');
    expect(slugify('A/B_C')).toBe('a-b-c');
  });

  it('falls back when nothing survives', () => {
    expect(spotSlugBase('日本')).toBe('spot');
    expect(citySlugOf('???')).toBe('other');
    expect(citySlugOf('São Paulo')).toBe('sao-paulo');
  });

  it('cuts long names without leaving a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('adds -2, -3 on a clash', async () => {
    const taken = new Set(['beach', 'beach-2']);
    expect(await uniqueSlug('beach', (slug) => Promise.resolve(taken.has(slug)))).toBe('beach-3');
    expect(await uniqueSlug('park', (slug) => Promise.resolve(taken.has(slug)))).toBe('park');
  });

  it('ends with a random tail when every number is taken', async () => {
    const slug = await uniqueSlug('x', () => Promise.resolve(true), 3);
    expect(slug).toMatch(/^x-[a-z0-9]+$/);
  });
});

describe('roundCoordinate', () => {
  it('keeps 5 decimals', () => {
    expect(roundCoordinate(40.4167754321)).toBe(40.41678);
    expect(roundCoordinate(-3.7037902)).toBe(-3.70379);
    expect(roundCoordinate(1)).toBe(1);
  });

  it('never returns negative zero', () => {
    expect(Object.is(roundCoordinate(-0.000001), 0)).toBe(true);
  });
});

describe('parseBbox', () => {
  it('reads minLng,minLat,maxLng,maxLat', () => {
    expect(parseBbox('-3.8,40.3,-3.6,40.5')).toEqual({
      minLng: -3.8,
      minLat: 40.3,
      maxLng: -3.6,
      maxLat: 40.5,
    });
    expect(parseBbox('-180,-90,180,90')).not.toBeNull();
  });

  it.each([
    '',
    '1,2,3',
    '1,2,3,4,5',
    'a,2,3,4',
    '1,,3,4',
    '-181,0,0,1',
    '0,0,181,1',
    '0,-91,1,1',
    '0,0,1,91',
    '5,0,5,1',
    '6,0,5,1',
    '0,2,1,2',
    '0,3,1,2',
    'NaN,0,1,1',
    'Infinity,0,1,1',
  ])('refuses %j', (value) => {
    expect(parseBbox(value)).toBeNull();
  });
});

describe('ratings', () => {
  it('rounds the average to 2 decimals', () => {
    expect(roundRating(4.666666)).toBe(4.67);
    expect(roundRating(null)).toBe(0);
    expect(roundRating(0)).toBe(0);
  });

  it('summarizes a list', () => {
    expect(summarizeRatings([])).toEqual({ avg: 0, count: 0 });
    expect(summarizeRatings([5, 4, 4])).toEqual({ avg: 4.33, count: 3 });
  });
});

describe('status transitions', () => {
  it('approves anything that is not live', () => {
    expect(nextSpotStatus('PENDING', 'approve')).toBe('LIVE');
    expect(nextSpotStatus('REJECTED', 'approve')).toBe('LIVE');
    expect(nextSpotStatus('HIDDEN', 'approve')).toBe('LIVE');
    expect(nextSpotStatus('LIVE', 'approve')).toBeNull();
  });

  it('hides only a live spot', () => {
    expect(nextSpotStatus('LIVE', 'hide')).toBe('HIDDEN');
    expect(nextSpotStatus('PENDING', 'hide')).toBeNull();
    expect(nextSpotStatus('HIDDEN', 'hide')).toBeNull();
  });

  it('rejects anything that is not rejected', () => {
    expect(nextSpotStatus('PENDING', 'reject')).toBe('REJECTED');
    expect(nextSpotStatus('LIVE', 'reject')).toBe('REJECTED');
    expect(nextSpotStatus('HIDDEN', 'reject')).toBe('REJECTED');
    expect(nextSpotStatus('REJECTED', 'reject')).toBeNull();
  });

  it('lets the proposer change only a pending or rejected spot', () => {
    expect(memberCanChange('PENDING')).toBe(true);
    expect(memberCanChange('REJECTED')).toBe(true);
    expect(memberCanChange('LIVE')).toBe(false);
    expect(memberCanChange('HIDDEN')).toBe(false);
  });
});

describe('extractSpotSlug', () => {
  it('reads a slug or a link ending in /spots/<slug>', () => {
    expect(extractSpotSlug('playa-del-ingles')).toBe('playa-del-ingles');
    expect(extractSpotSlug('  Playa-Del-Ingles ')).toBe('playa-del-ingles');
    expect(extractSpotSlug('https://cruising.codeqlick.com/en/spots/the-pier-2')).toBe(
      'the-pier-2',
    );
    expect(extractSpotSlug('https://cruising.codeqlick.com/es/spots/the-pier?x=1#top')).toBe(
      'the-pier',
    );
    expect(extractSpotSlug('https://cruising.codeqlick.com/es/spots/the-pier/')).toBe('the-pier');
  });

  it('returns null for anything else', () => {
    expect(extractSpotSlug('')).toBeNull();
    expect(extractSpotSlug('https://example.com/about')).toBeNull();
    expect(extractSpotSlug('https://cruising.codeqlick.com/es/spots/')).toBeNull();
    expect(extractSpotSlug('not a slug!')).toBeNull();
  });
});

describe('isSuspended', () => {
  const now = new Date('2026-11-15T12:00:00Z');

  it('is not suspended without a profile or a suspension', () => {
    expect(isSuspended(null, now)).toBe(false);
    expect(isSuspended(undefined, now)).toBe(false);
    expect(isSuspended({ suspendedAt: null, suspendedUntil: null }, now)).toBe(false);
  });

  it('is suspended until lifted when there is no end', () => {
    expect(isSuspended({ suspendedAt: new Date('2026-01-01'), suspendedUntil: null }, now)).toBe(
      true,
    );
  });

  it('stops counting once a timed suspension ended', () => {
    const suspendedAt = new Date('2026-11-14T12:00:00Z');
    expect(
      isSuspended({ suspendedAt, suspendedUntil: new Date('2026-11-16T12:00:00Z') }, now),
    ).toBe(true);
    expect(
      isSuspended({ suspendedAt, suspendedUntil: new Date('2026-11-15T11:00:00Z') }, now),
    ).toBe(false);
  });
});
