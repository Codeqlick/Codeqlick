import { describe, expect, it } from 'vitest';
import { englishOn, siteContentSchema, siteEnglishSchema } from './managed-sites.schemas.js';
import { createNewsSchema, updateNewsSchema } from './site-news.js';
import { changedSections } from './site-editing.js';
import type { SiteContent } from './managed-sites.schemas.js';

const en = {
  business: { description: 'Hair salon in Malasaña.' },
  hero: { title: 'Your hair, our craft', facts: [{}, { label: 'in the area' }] },
  services: { items: [{ name: 'Cut' }, {}, { description: 'With a wash.' }] },
  about: { paragraphs: ['', 'Second paragraph.'] },
  menu: { categories: [{ name: 'Starters', items: [{}, { name: 'Croquettes' }] }] },
  booking: { label: 'Book' },
  notices: [{ text: 'Closed on Monday' }],
  hours: [{ days: 'Monday to Friday' }],
};

describe('the English version of a site (decision 106)', () => {
  it('takes the English twins of the texts, empty ones included', () => {
    expect(siteEnglishSchema.safeParse(en).success).toBe(true);
    expect(siteEnglishSchema.safeParse({ hero: { title: '' } }).success).toBe(true);
  });

  it('keeps the Spanish limits', () => {
    expect(siteEnglishSchema.safeParse({ hero: { title: 'x'.repeat(121) } }).success).toBe(false);
    expect(siteEnglishSchema.safeParse({ booking: { label: 'x'.repeat(41) } }).success).toBe(false);
    const facts = [{}, {}, {}, {}];
    expect(siteEnglishSchema.safeParse({ hero: { facts } }).success).toBe(false);
  });

  it('refuses anything that is not a translatable text', () => {
    expect(siteEnglishSchema.safeParse({ business: { name: 'Other' } }).success).toBe(false);
    expect(siteEnglishSchema.safeParse({ hero: { primary: { href: '/x' } } }).success).toBe(false);
    expect(siteEnglishSchema.safeParse({ booking: { url: 'https://x.es' } }).success).toBe(false);
    expect(siteEnglishSchema.safeParse({ hero: { image: { file: 'a.jpg' } } }).success).toBe(false);
    expect(siteEnglishSchema.safeParse({ theme: {} }).success).toBe(false);
  });

  it('is part of the content, with its switch', () => {
    const { english, en: twins } = siteContentSchema.shape;
    expect(english.safeParse(true).success).toBe(true);
    expect(english.safeParse('yes').success).toBe(false);
    expect(twins.safeParse(en).success).toBe(true);
    expect(englishOn({ english: true })).toBe(true);
    expect(englishOn({ english: false, en })).toBe(false);
    expect(englishOn(null)).toBe(false);
  });

  it('is named in the team email when it changes', () => {
    const before = { english: false } as SiteContent;
    expect(changedSections(before, { english: true } as SiteContent)).toEqual(['English version']);
    expect(changedSections(before, { english: false, en } as SiteContent)).toEqual([
      'English texts',
    ]);
  });
});

describe('the English texts of a news post', () => {
  const valid = { title: 'Oferta', summary: 'Resumen', body: 'Texto' };

  it('are optional, and empty ones are stored as nothing', () => {
    expect(createNewsSchema.parse(valid)).not.toHaveProperty('titleEn');
    const parsed = createNewsSchema.parse({ ...valid, titleEn: 'Offer', summaryEn: '  ' });
    expect(parsed.titleEn).toBe('Offer');
    expect(parsed.summaryEn).toBeNull();
    expect(updateNewsSchema.parse({ bodyEn: null }).bodyEn).toBeNull();
  });

  it('keep the limits and the link rule of the Spanish ones', () => {
    expect(createNewsSchema.safeParse({ ...valid, titleEn: 'x'.repeat(121) }).success).toBe(false);
    expect(createNewsSchema.safeParse({ ...valid, bodyEn: '[x](ftp://a.es)' }).success).toBe(false);
  });
});
