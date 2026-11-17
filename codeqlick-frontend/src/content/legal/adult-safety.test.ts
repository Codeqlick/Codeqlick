import { describe, expect, it } from 'vitest';
import { routing } from '@/i18n/routing';
import { adultSafetySection } from './adult-safety';
import { cruisingLegalDocument } from './cruising';
import { swipeLegalDocument } from './swipe';

const OWNER = { name: 'Owner Name', taxId: 'X1234567Z', address: 'Calle 1, Madrid' };
const MAIL = 'hello@codeqlick.com';
const LINK = `[${MAIL}](mailto:${MAIL})`;

describe("the 'Safety across Codeqlick's 18+ apps' section (decision 119)", () => {
  it.each(routing.locales)('exists in %s for the terms and the privacy policy', (locale) => {
    for (const kind of ['terms', 'privacy'] as const) {
      const section = adultSafetySection(kind, locale, MAIL);
      expect(section.startsWith('## ')).toBe(true);
      expect(section).not.toContain('${');
    }
    const privacy = adultSafetySection('privacy', locale, MAIL);
    // Art. 6.1.f and 9.2.a GDPR, however each language writes them.
    expect(privacy).toMatch(/\b6\b/);
    expect(privacy).toMatch(/\b9\b/);
    expect(privacy).toContain('HMAC');
    expect(privacy).toContain(MAIL);
  });

  it.each(routing.locales)("closes Cruising's terms and privacy in %s", (locale) => {
    for (const page of ['cruising-terms', 'cruising-privacy'] as const) {
      const document = cruisingLegalDocument(page, OWNER, locale);
      const kind = page === 'cruising-terms' ? 'terms' : 'privacy';
      expect(document.markdown.endsWith(adultSafetySection(kind, locale, LINK))).toBe(true);
      expect(document.updated).toContain('17');
    }
  });

  it.each(['en', 'es'] as const)("closes Swipe's terms and privacy in %s", (locale) => {
    for (const page of ['swipe-terms', 'swipe-privacy'] as const) {
      const document = swipeLegalDocument(page, OWNER, locale);
      const kind = page === 'swipe-terms' ? 'terms' : 'privacy';
      expect(document.markdown).toContain(adultSafetySection(kind, locale, LINK));
      expect(document.markdown).not.toContain('«Swipe» y la fecha');
    }
  });

  it("says Cruising's approved verification photo is now kept, in every language", () => {
    const text = cruisingLegalDocument('cruising-privacy', OWNER, 'en').markdown;
    expect(text).not.toContain('deleted as soon as it is reviewed');
    expect(text).toContain('kept privately while the verification stands');
    for (const locale of routing.locales) {
      const privacy = cruisingLegalDocument('cruising-privacy', OWNER, locale).markdown;
      expect(privacy).toContain('Codeqlick');
    }
  });
});
