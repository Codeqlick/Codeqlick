import { describe, expect, it } from 'vitest';
import { applyEdits, changedParts, editableOf } from './site-editing.js';
import type { SiteContent } from './managed-sites.schemas.js';

const content = {
  business: { name: 'Alba', description: 'Peluquería', schemaType: 'HairSalon' },
  theme: {},
  contact: { phone: '954 00 00 00' },
  hours: [{ days: 'Lunes', hours: 'Cerrado' }],
  openingHoursSpec: ['Tu-Fr 09:30-20:00'],
  hero: {
    title: 'Hola',
    text: 'Texto',
    image: { file: 'hero.jpg', alt: 'x' },
    primary: { label: 'Cita', href: '#contacto' },
  },
  about: { title: 'Nosotras', paragraphs: ['Uno'], highlights: ['Veganos'] },
  contactSection: { title: 'Contacto' },
  legal: { owner: 'Alba', taxId: '', address: '', email: 'a@a.es' },
} as unknown as SiteContent;

describe('site editing', () => {
  it('round-trips the editable part and keeps what clients do not edit', () => {
    const edits = editableOf(content);
    const next = applyEdits(content, { ...edits, hero: { title: 'Nuevo', text: 'Texto' } });
    expect(next.hero).toMatchObject({ title: 'Nuevo', image: { file: 'hero.jpg' } });
    expect(next.about?.highlights).toEqual(['Veganos']);
    expect(next.openingHoursSpec).toEqual(['Tu-Fr 09:30-20:00']);
    expect(changedParts(edits, editableOf(next))).toEqual(['Header']);
  });

  it('drops the machine-readable hours when the hours change', () => {
    const edits = { ...editableOf(content), hours: [{ days: 'Lunes', hours: '10:00–14:00' }] };
    const next = applyEdits(content, edits);
    expect(next.hours).toEqual([{ days: 'Lunes', hours: '10:00–14:00' }]);
    expect(next).not.toHaveProperty('openingHoursSpec');
  });
});
