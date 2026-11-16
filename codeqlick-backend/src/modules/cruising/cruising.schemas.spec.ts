import { describe, expect, it } from 'vitest';
import {
  activeQuerySchema,
  bboxQuerySchema,
  onboardingSchema,
  placeParamsSchema,
  reportSchema,
  reviewSchema,
  searchQuerySchema,
  spotPatchSchema,
  spotSchema,
  takedownSchema,
} from './cruising.schemas.js';

const SPOT = {
  name: 'The old pier',
  type: 'BEACH',
  lat: 40.41677,
  lng: -3.70379,
  countryCode: 'ES',
  city: 'Madrid',
  description: 'A quiet pier at the end of the beach.',
} as const;

const ID = '11111111-1111-4111-8111-111111111111';

describe('bboxQuerySchema', () => {
  it('turns the box into numbers', () => {
    const parsed = bboxQuerySchema.parse({ bbox: '-3.8,40.3,-3.6,40.5', type: 'PARK' });
    expect(parsed.bbox).toEqual({ minLng: -3.8, minLat: 40.3, maxLng: -3.6, maxLat: 40.5 });
    expect(parsed.type).toBe('PARK');
  });

  it('needs a valid box and a known type', () => {
    expect(bboxQuerySchema.safeParse({}).success).toBe(false);
    expect(bboxQuerySchema.safeParse({ bbox: '3,40,-3,41' }).success).toBe(false);
    expect(bboxQuerySchema.safeParse({ bbox: '170,0,190,10' }).success).toBe(false);
    expect(bboxQuerySchema.safeParse({ bbox: '0,0,1,1', type: 'MOON' }).success).toBe(false);
  });

  it('takes a minimum rating of 1 to 5', () => {
    expect(bboxQuerySchema.parse({ bbox: '0,0,1,1', minRating: '4' }).minRating).toBe(4);
    expect(bboxQuerySchema.parse({ bbox: '0,0,1,1' }).minRating).toBeUndefined();
    for (const minRating of ['0', '6', '3.5', 'a', '']) {
      expect(bboxQuerySchema.safeParse({ bbox: '0,0,1,1', minRating }).success).toBe(false);
    }
  });
});

describe('activeQuerySchema', () => {
  it('needs a valid box', () => {
    expect(activeQuerySchema.parse({ bbox: '0,0,0.25,0.25' }).bbox).toEqual({
      minLng: 0,
      minLat: 0,
      maxLng: 0.25,
      maxLat: 0.25,
    });
    expect(activeQuerySchema.safeParse({}).success).toBe(false);
    expect(activeQuerySchema.safeParse({ bbox: '1,0,0,1' }).success).toBe(false);
  });
});

describe('searchQuerySchema', () => {
  it('takes 2 to 60 characters, trimmed', () => {
    expect(searchQuerySchema.parse({ q: '  Málaga ' }).q).toBe('Málaga');
    expect(searchQuerySchema.safeParse({ q: 'ab' }).success).toBe(true);
    expect(searchQuerySchema.safeParse({ q: ' a ' }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: 'x'.repeat(61) }).success).toBe(false);
    expect(searchQuerySchema.safeParse({}).success).toBe(false);
  });
});

describe('spotSchema', () => {
  it('accepts a spot with optional best times', () => {
    expect(spotSchema.safeParse(SPOT).success).toBe(true);
    expect(spotSchema.safeParse({ ...SPOT, bestTimes: 'weekday evenings' }).success).toBe(true);
  });

  it('enforces the limits', () => {
    expect(spotSchema.safeParse({ ...SPOT, name: 'x'.repeat(81) }).success).toBe(false);
    expect(spotSchema.safeParse({ ...SPOT, name: 'x' }).success).toBe(false);
    expect(spotSchema.safeParse({ ...SPOT, city: 'x'.repeat(81) }).success).toBe(false);
    expect(spotSchema.safeParse({ ...SPOT, description: 'x'.repeat(1001) }).success).toBe(false);
    expect(spotSchema.safeParse({ ...SPOT, description: 'x'.repeat(1000) }).success).toBe(true);
    expect(spotSchema.safeParse({ ...SPOT, bestTimes: 'x'.repeat(201) }).success).toBe(false);
    expect(spotSchema.safeParse({ ...SPOT, lat: 90.1 }).success).toBe(false);
    expect(spotSchema.safeParse({ ...SPOT, lng: -180.1 }).success).toBe(false);
    expect(spotSchema.safeParse({ ...SPOT, countryCode: 'ZZ' }).success).toBe(false);
    expect(spotSchema.safeParse({ ...SPOT, type: 'MOON' }).success).toBe(false);
  });
});

describe('spotPatchSchema', () => {
  it('takes any of the fields but not nothing', () => {
    expect(spotPatchSchema.safeParse({ name: 'New name' }).success).toBe(true);
    expect(spotPatchSchema.safeParse({ bestTimes: null }).success).toBe(true);
    expect(spotPatchSchema.safeParse({}).success).toBe(false);
    expect(spotPatchSchema.safeParse({ lat: 100 }).success).toBe(false);
  });
});

describe('onboardingSchema', () => {
  const body = {
    birthDate: '1990-01-01',
    acceptTerms: true,
    consentSpecialData: true,
    termsVersion: '2026-11-15.1',
  };

  it('needs the rules and the separate consent', () => {
    expect(onboardingSchema.safeParse(body).success).toBe(true);
    expect(onboardingSchema.safeParse({ ...body, acceptTerms: false }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...body, consentSpecialData: false }).success).toBe(false);
    expect(
      onboardingSchema.safeParse({
        birthDate: body.birthDate,
        acceptTerms: true,
        termsVersion: body.termsVersion,
      }).success,
    ).toBe(false);
    expect(onboardingSchema.safeParse({ ...body, birthDate: '01/01/1990' }).success).toBe(false);
  });
});

describe('reviewSchema', () => {
  it('takes a 1 to 5 rating and optional text of up to 1000 characters', () => {
    expect(reviewSchema.parse({ rating: 5 }).rating).toBe(5);
    expect(reviewSchema.parse({ rating: 5 }).text ?? null).toBeNull();
    expect(reviewSchema.parse({ rating: 3, text: '  ' }).text).toBeNull();
    expect(reviewSchema.parse({ rating: 3, text: ' Nice ' }).text).toBe('Nice');
    expect(reviewSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: 6 }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: 2.5 }).success).toBe(false);
    expect(reviewSchema.safeParse({ rating: 3, text: 'x'.repeat(1001) }).success).toBe(false);
  });
});

describe('reportSchema', () => {
  it('needs exactly one target', () => {
    expect(reportSchema.safeParse({ spotId: ID, reason: 'DANGER' }).success).toBe(true);
    expect(reportSchema.safeParse({ reviewId: ID, reason: 'SPAM' }).success).toBe(true);
    expect(reportSchema.safeParse({ reason: 'SPAM' }).success).toBe(false);
    expect(reportSchema.safeParse({ spotId: ID, reviewId: ID, reason: 'SPAM' }).success).toBe(
      false,
    );
  });

  it('needs details for WRONG_INFO', () => {
    expect(reportSchema.safeParse({ spotId: ID, reason: 'WRONG_INFO' }).success).toBe(false);
    expect(
      reportSchema.safeParse({ spotId: ID, reason: 'WRONG_INFO', details: 'Wrong city' }).success,
    ).toBe(true);
  });

  it('limits details to 1000 characters and the reason to the list', () => {
    expect(
      reportSchema.safeParse({ spotId: ID, reason: 'OTHER', details: 'x'.repeat(1001) }).success,
    ).toBe(false);
    expect(reportSchema.safeParse({ spotId: ID, reason: 'NOPE' }).success).toBe(false);
  });
});

describe('takedownSchema', () => {
  const body = { email: 'a@example.com', reason: 'ILLEGAL', details: 'This is not allowed.' };

  it('needs an email, a reason and details', () => {
    const parsed = takedownSchema.parse(body);
    expect(parsed.locale).toBe('en');
    expect(takedownSchema.safeParse({ ...body, email: 'nope' }).success).toBe(false);
    expect(takedownSchema.safeParse({ ...body, details: 'short' }).success).toBe(false);
    expect(takedownSchema.safeParse({ ...body, reason: 'WRONG_INFO' }).success).toBe(false);
  });

  it('takes an optional link and the honeypot', () => {
    expect(takedownSchema.safeParse({ ...body, spotLink: 'the-pier', website: 'x' }).success).toBe(
      true,
    );
  });
});

describe('placeParamsSchema', () => {
  it('upper-cases the country', () => {
    expect(placeParamsSchema.parse({ countryCode: 'es', citySlug: 'madrid' })).toEqual({
      countryCode: 'ES',
      citySlug: 'madrid',
    });
    expect(placeParamsSchema.safeParse({ countryCode: 'ESP', citySlug: 'madrid' }).success).toBe(
      false,
    );
  });
});
