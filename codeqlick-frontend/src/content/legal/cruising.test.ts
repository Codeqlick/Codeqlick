import { describe, expect, it } from 'vitest';
import { routing } from '@/i18n/routing';
import { cruisingLegalDocument } from './cruising';

const OWNER = { name: 'Owner Name', taxId: 'X1234567Z', address: 'Calle 1, Madrid' };

describe("Cruising's legal texts in its six languages (decision 103)", () => {
  it.each(routing.locales)('writes the terms and the privacy policy in %s', (locale) => {
    for (const page of ['cruising-terms', 'cruising-privacy'] as const) {
      const document = cruisingLegalDocument(page, OWNER, locale);
      expect(document.title).not.toBe('');
      expect(document.markdown).toContain('Owner Name');
      expect(document.markdown).toContain('X1234567Z');
      expect(document.markdown).toContain('hello@neoqlick.com');
      expect(document.markdown).not.toContain('${');
      if (locale !== 'en') {
        expect(document.markdown).not.toBe(cruisingLegalDocument(page, OWNER, 'en').markdown);
      }
    }
    // The terms link the rules and the removal form in the page's language.
    const terms = cruisingLegalDocument('cruising-terms', OWNER, locale).markdown;
    expect(terms).toContain(`/${locale}/cruising/rules`);
    expect(terms).toContain(`/${locale}/cruising/takedown`);
  });
});
