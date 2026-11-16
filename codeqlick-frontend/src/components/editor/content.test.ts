import { describe, expect, it } from 'vitest';
import {
  contrast,
  dayOf,
  followTwins,
  getAt,
  isTranslatable,
  liveTexts,
  missingEnglish,
  noticeState,
  setAt,
  structureOf,
  themeVars,
  type Content,
} from './content';

const site: Content = {
  business: { name: 'Alba', description: 'Peluquería' },
  theme: { primary: '#A84A33', text: '#2A1F1C', corners: 'round', headingFont: 'playfair' },
  hero: { title: 'Hola', image: { file: 'hero.jpg', alt: 'Peluquera' } },
  services: { title: 'Servicios', items: [{ name: 'Corte', price: '15 €' }] },
  contact: { phone: '954 00 00 00' },
};

describe('the website editor’s content helpers', () => {
  it('reads and writes by path, copying what it changes', () => {
    const next = setAt(site, 'services.items.0.price', '18 €');
    expect(getAt(next, 'services.items.0.price')).toBe('18 €');
    expect(getAt(site, 'services.items.0.price')).toBe('15 €');
    expect(setAt(site, 'hero.eyebrow', 'Triana')).toMatchObject({ hero: { eyebrow: 'Triana' } });
    expect(getAt(setAt(site, 'contact.phone', undefined), 'contact')).toEqual({});
    expect(getAt(setAt(site, 'hours.0.days', 'Lunes'), 'hours')).toEqual([{ days: 'Lunes' }]);
  });

  it('patches marked texts live and rebuilds for anything else', () => {
    expect(liveTexts(site)).toMatchObject({
      'hero.title': 'Hola',
      'services.items.0.name': 'Corte',
      'business.description': 'Peluquería',
    });
    expect(liveTexts(site)).not.toHaveProperty('contact.phone');
    const before = structureOf(site);
    // A text that is there, the theme: live.
    expect(structureOf(setAt(site, 'hero.title', 'Adiós'))).toBe(before);
    expect(structureOf(setAt(site, 'theme.primary', '#000000'))).toBe(before);
    // A new text, a photo, a contact detail, another item: rebuilt.
    expect(structureOf(setAt(site, 'hero.eyebrow', 'Triana'))).not.toBe(before);
    expect(structureOf(setAt(site, 'hero.image.file', 'media/x.jpg'))).not.toBe(before);
    expect(structureOf(setAt(site, 'contact.phone', '600'))).not.toBe(before);
    expect(structureOf(setAt(site, 'services.items.1', { name: 'Tinte' }))).not.toBe(before);
  });

  it('turns the theme into the template’s variables and checks contrast', () => {
    expect(themeVars(site.theme)).toMatchObject({
      '--primary': '#A84A33',
      '--radius-button': '999px',
      '--font-heading': "'Playfair Display Variable', Georgia, serif",
    });
    expect(contrast('#FFFFFF', '#000000')).toBeCloseTo(21);
    expect(contrast('#FFFFFF', '#FFFF00')!).toBeLessThan(4.5);
    expect(contrast('red', '#000000')).toBeNull();
  });
});

describe('the site notices in the editor', () => {
  it('says whether a notice shows on a day, as the site does', () => {
    const today = '2026-08-15';
    expect(noticeState({ from: '2026-08-10', until: '2026-08-20' }, today)).toBe('showing');
    expect(noticeState({ until: '2026-08-15' }, today)).toBe('showing');
    expect(noticeState({ from: '2026-08-16', until: '2026-08-20' }, today)).toBe('scheduled');
    expect(noticeState({ until: '2026-08-14' }, today)).toBe('over');
    expect(noticeState({ from: '2026-08-10' }, today)).toBe('incomplete');
  });

  it('writes days as the site compares them', () => {
    expect(dayOf(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('patches their texts live', () => {
    expect(
      liveTexts({ ...site, notices: [{ text: 'Cerrado', until: '2026-08-20' }] }),
    ).toMatchObject({ 'notices.0.text': 'Cerrado' });
  });
});

describe('the English version in the editor (decision 106)', () => {
  const bilingual: Content = {
    ...site,
    about: { title: 'Nosotras', paragraphs: ['Uno', 'Dos'] },
    menu: { title: 'Carta', categories: [{ name: 'Postres', items: [{ name: 'Flan' }] }] },
    english: true,
    en: { hero: { title: 'Hello' }, services: { items: [{ name: 'Cut' }] } },
  };

  it('knows which texts have an English twin', () => {
    expect(isTranslatable('hero.title')).toBe(true);
    expect(isTranslatable('services.items.3.description')).toBe(true);
    expect(isTranslatable('about.paragraphs.1')).toBe(true);
    expect(isTranslatable('gallery.images.0.alt')).toBe(true);
    expect(isTranslatable('business.name')).toBe(false);
    expect(isTranslatable('hero.primary.href')).toBe(false);
    expect(isTranslatable('contact.phone')).toBe(false);
    expect(isTranslatable('legal.owner')).toBe(false);
  });

  it('counts the Spanish texts whose English is still empty, prices and an off menu aside', () => {
    expect(missingEnglish(bilingual)).toEqual([
      'business.description',
      'hero.image.alt',
      'services.title',
      'about.title',
      'about.paragraphs.0',
      'about.paragraphs.1',
      'menu.title',
      'menu.categories.0.name',
      'menu.categories.0.items.0.name',
    ]);
    expect(missingEnglish(bilingual, { menu: false })).not.toContain('menu.title');
    const blank = setAt(bilingual, 'en.services.title', '   ');
    expect(missingEnglish(blank)).toContain('services.title');
  });

  it('writes a later item’s twin with blank items before it, never holes', () => {
    const next = setAt(bilingual, 'en.about.paragraphs.1', 'Two');
    expect(getAt(next, 'en.about.paragraphs')).toEqual(['', 'Two']);
    const item = setAt(bilingual, 'en.services.items.2.name', 'Dye');
    expect(getAt(item, 'en.services.items')).toEqual([{ name: 'Cut' }, {}, { name: 'Dye' }]);
    expect(JSON.stringify(item)).not.toContain('null');
  });

  it('moves and removes the twins with their Spanish items', () => {
    const list: Content = {
      services: { items: [{ name: 'Corte' }, { name: 'Color' }, { name: 'Peinado' }] },
      en: { services: { items: [{ name: 'Cut' }, { name: 'Colour' }] } },
    };
    expect(followTwins(list, 'services.items', 3, { removed: 0 })).toEqual([
      { name: 'Colour' },
      {},
    ]);
    expect(followTwins(list, 'services.items', 3, { from: 0, to: 2 })).toEqual([
      { name: 'Colour' },
      {},
      { name: 'Cut' },
    ]);
    expect(followTwins(site, 'services.items', 1, { removed: 0 })).toBeUndefined();
  });

  it('patches the English page live, with the Spanish text where the English is empty', () => {
    const texts = liveTexts(bilingual);
    expect(texts['en.hero.title']).toBe('Hello');
    expect(texts['en.services.items.0.name']).toBe('Cut');
    expect(texts['en.services.title']).toBe('Servicios');
    expect(liveTexts(site)).not.toHaveProperty('en.hero.title');
    // Typing English never rebuilds; switching it on does.
    expect(structureOf(setAt(bilingual, 'en.hero.text', 'Hi'))).toBe(structureOf(bilingual));
    expect(structureOf(bilingual)).not.toBe(structureOf(setAt(bilingual, 'english', undefined)));
  });
});
