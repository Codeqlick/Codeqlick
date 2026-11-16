import { describe, expect, it } from 'vitest';
import { Locale } from '../generated/prisma/client.js';
import {
  ACCOUNT_LOCALES,
  accountLocaleSchema,
  localeSchema,
  siteLocale,
  toAccountLocale,
  toApiLocale,
  toDbLocale,
} from './schemas/common.schemas.js';

describe('account languages (decision 103)', () => {
  it('round-trips every account language through the database enum', () => {
    for (const locale of ACCOUNT_LOCALES) expect(toAccountLocale(toDbLocale(locale))).toBe(locale);
  });

  it("falls back to English for the website's emails and links", () => {
    expect(siteLocale('en')).toBe('en');
    expect(siteLocale('es')).toBe('es');
    for (const locale of ['fr', 'de', 'it', 'pt'] as const) expect(siteLocale(locale)).toBe('en');
    expect(toApiLocale(Locale.ES)).toBe('es');
    expect(toApiLocale(Locale.FR)).toBe('en');
    expect(toApiLocale(Locale.PT)).toBe('en');
  });

  it('accepts the six languages for an account, only two for the website', () => {
    expect(accountLocaleSchema.safeParse('de').success).toBe(true);
    expect(accountLocaleSchema.safeParse('nl').success).toBe(false);
    expect(localeSchema.safeParse('de').success).toBe(false);
  });
});
