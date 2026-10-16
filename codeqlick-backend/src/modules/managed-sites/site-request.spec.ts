import { describe, expect, it } from 'vitest';
import type { SiteContent } from './managed-sites.schemas.js';
import { contentFromRequest, requestSummary, type SiteRequest } from './site-request.js';

const base = {
  business: { name: 'Alba', description: 'Demo', schemaType: 'HairSalon' },
  theme: { primary: '#A84A33' },
  contact: { phone: '954 00 00 00' },
  openingHoursSpec: ['Tu-Fr 09:30-20:00'],
  hero: {
    title: 'Demo',
    text: 'Demo',
    image: { file: 'hero.jpg', alt: 'x' },
    primary: { label: 'Pedir cita', href: '#contacto' },
    facts: [{ value: '12 años', label: 'en Triana' }],
  },
  services: { title: 'Lo que hacemos', items: [{ name: 'Demo' }] },
  testimonials: { title: 'Opiniones', items: [{ quote: 'Inventada', author: 'X' }] },
  contactSection: { title: 'Pide tu cita' },
  legal: { owner: 'x', taxId: '', address: '', email: 'x@x.es' },
} as unknown as SiteContent;

const request: SiteRequest = {
  preset: 'peluqueria',
  business: {
    name: 'Barbería Paco',
    kind: 'Barbería',
    city: 'Málaga',
    address: 'Calle Larios 5, 29005 Málaga',
    phone: undefined,
    email: undefined,
    whatsapp: '600 11 22 33',
    hours: 'Lunes a viernes: 9:00–20:00\nSábado – 10:00–14:00\nDomingo cerrado',
    services: 'Corte — 15 €\nCorte y barba - 22 €\nArreglo de barba',
    about: 'Barbería de toda la vida.\n\nDesde 1990 en el centro.',
  },
};

describe('site requests', () => {
  it('turns a request into the site content, dropping the demo texts', () => {
    const content = contentFromRequest(base, request);
    expect(content.business).toMatchObject({
      name: 'Barbería Paco',
      tagline: 'Barbería · Málaga',
      schemaType: 'LocalBusiness',
    });
    expect(content.contact).toEqual({
      phone: undefined,
      whatsapp: '34600112233',
      email: undefined,
      address: { street: 'Calle Larios 5', postalCode: '29005', city: 'Málaga', region: 'Málaga' },
    });
    expect(content.hours).toEqual([
      { days: 'Lunes a viernes', hours: '9:00–20:00' },
      { days: 'Sábado', hours: '10:00–14:00' },
      { days: 'Domingo cerrado', hours: '—' },
    ]);
    expect(content.services?.items).toEqual([
      { name: 'Corte', price: '15 €' },
      { name: 'Corte y barba', price: '22 €' },
      { name: 'Arreglo de barba' },
    ]);
    expect(content.about?.paragraphs).toEqual([
      'Barbería de toda la vida.',
      'Desde 1990 en el centro.',
    ]);
    expect(content.hero).toMatchObject({ title: 'Barbería Paco', image: { file: 'hero.jpg' } });
    expect(content.hero.facts).toBeUndefined();
    expect(content.testimonials).toBeUndefined();
    expect(content).not.toHaveProperty('openingHoursSpec');
    expect(content.theme).toEqual({ primary: '#A84A33' });
  });

  it('keeps an address without a postcode', () => {
    const content = contentFromRequest(base, {
      ...request,
      business: { ...request.business, address: 'Calle Feria 12, Málaga' },
    });
    expect(content.contact.address).toEqual({
      street: 'Calle Feria 12',
      city: 'Málaga',
      region: 'Málaga',
    });
  });

  it('summarises the request for the team', () => {
    const text = requestSummary(request);
    expect(text).toContain('style: Peluquería (Alba Estudio)');
    expect(text).toContain('Business: Barbería Paco (Barbería, Málaga)');
    expect(text).toContain('Corte y barba - 22 €');
  });
});
