import { describe, expect, it } from 'vitest';
import {
  ADULT_APPS,
  ALL_CATEGORIES,
  appNames,
  blockApp,
  blockLabel,
  categoryOptions,
  hasAlsoReported,
  isSeriousCategory,
  parseAdultApp,
  parseCategory,
  parseSeriousCategory,
  parseSharedDuration,
  SERIOUS_CATEGORIES,
} from './adult';

describe('categories (decision 114)', () => {
  it('lists the three serious ones first and ten in all', () => {
    expect(ALL_CATEGORIES).toHaveLength(10);
    expect(ALL_CATEGORIES.slice(0, 3)).toEqual([...SERIOUS_CATEGORIES]);
    expect(isSeriousCategory('MINOR')).toBe(true);
    expect(isSeriousCategory('NON_CONSENSUAL')).toBe(true);
    expect(isSeriousCategory('ILLEGAL')).toBe(true);
    expect(isSeriousCategory('SPAM')).toBe(false);
    expect(isSeriousCategory(null)).toBe(false);
  });

  it('labels the serious ones as applying in the three apps, and only those', () => {
    const options = categoryOptions((category) => category.toLowerCase(), 'in all three');
    expect(options).toHaveLength(10);
    expect(options.find((option) => option.value === 'MINOR')?.label).toBe('minor (in all three)');
    expect(options.find((option) => option.value === 'SPAM')?.label).toBe('spam');
    expect(options.filter((option) => option.label.includes('in all three'))).toHaveLength(3);
  });

  it('offers only the serious ones to the shared suspension form', () => {
    const options = categoryOptions((category) => category, 'x', 'serious');
    expect(options.map((option) => option.value)).toEqual(['MINOR', 'NON_CONSENSUAL', 'ILLEGAL']);
  });

  it('parses form values and refuses anything else', () => {
    expect(parseCategory('HATE')).toBe('HATE');
    expect(parseCategory('nope')).toBeNull();
    expect(parseCategory(null)).toBeNull();
    expect(parseSeriousCategory('ILLEGAL')).toBe('ILLEGAL');
    expect(parseSeriousCategory('HATE')).toBeNull();
    expect(parseAdultApp('SWIPE')).toBe('SWIPE');
    expect(parseAdultApp('MEETINGS')).toBeNull();
    expect(parseSharedDuration('permanent')).toBe('permanent');
    expect(parseSharedDuration('1y')).toBeNull();
  });
});

describe('the blocks list naming rule (decision 112)', () => {
  const fallback = 'A member of another 18+ app';

  it('names the person by their name in the asking app', () => {
    expect(blockLabel({ name: 'ana_cruz' }, fallback)).toBe('ana_cruz');
  });

  it('says "a member of another 18+ app" when they have no name here', () => {
    expect(blockLabel({ name: null }, fallback)).toBe(fallback);
    expect(blockLabel({ name: '   ' }, fallback)).toBe(fallback);
  });

  it('tags the app where the block was made, and nothing on older rows', () => {
    expect(blockApp({ sourceApp: 'SWIPE' })).toBe('Swipe');
    expect(blockApp({ sourceApp: 'CRUISING' })).toBe('Cruising');
    expect(blockApp({ sourceApp: null })).toBeNull();
  });
});

describe('"also reported in"', () => {
  it('joins the app names', () => {
    expect(appNames(['SWIPE', 'CRUISING'])).toBe('Swipe · Cruising');
    expect(appNames([...ADULT_APPS])).toBe('Cruising · Swipe · Videochat');
  });

  it('shows only when another app has reports', () => {
    expect(hasAlsoReported(null)).toBe(false);
    expect(hasAlsoReported(undefined)).toBe(false);
    expect(hasAlsoReported({ apps: [], open: 0 })).toBe(false);
    expect(hasAlsoReported({ apps: ['SWIPE'], open: 2 })).toBe(true);
  });
});
