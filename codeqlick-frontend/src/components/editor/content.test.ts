import { describe, expect, it } from 'vitest';
import {
  contrast,
  dayOf,
  getAt,
  liveTexts,
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
