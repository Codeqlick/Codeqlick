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

describe('account languages', () => {
  it('round-trips every account language through the database enum', () => {
    for (const locale of ACCOUNT_LOCALES) expect(toAccountLocale(toDbLocale(locale))).toBe(locale);
  });

  it("maps the website's emails and links to the same two languages", () => {
    expect(siteLocale('en')).toBe('en');
    expect(siteLocale('es')).toBe('es');
    expect(toApiLocale(Locale.ES)).toBe('es');
    expect(toApiLocale(Locale.EN)).toBe('en');
  });

  it('accepts only English and Spanish', () => {
    expect(accountLocaleSchema.safeParse('es').success).toBe(true);
    expect(accountLocaleSchema.safeParse('de').success).toBe(false);
    expect(localeSchema.safeParse('de').success).toBe(false);
  });
});
