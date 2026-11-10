import { describe, expect, it } from 'vitest';
import { siteContentSchema } from './managed-sites.schemas.js';

const booking = siteContentSchema.shape.booking;

describe('the "Pedir cita" button', () => {
  it.each([
    'https://citas.codeqlick.com/es/peluqueria-marta',
    'https://citas.codeqlick.com/en/abc',
    'http://citas.localhost:3000/es/fisio-ana',
  ])('takes the booking page %s', (url) => {
    expect(booking.safeParse({ url, label: 'Pedir cita' }).success).toBe(true);
  });

  it.each([
    'http://citas.codeqlick.com/es/peluqueria',
    'https://example.com/es/peluqueria',
    'https://citas.codeqlick.com/fr/peluqueria',
    'https://citas.codeqlick.com/es/peluqueria/extra',
    'https://citas.codeqlick.com/es/ab',
    'https://citas.codeqlick.com/es/Peluqueria',
    'https://citas.codeqlick.com/es/peluqueria?x=1',
    'https://citas.codeqlick.com/es/peluqueria#top',
    'javascript:alert(1)',
  ])('refuses %s', (url) => {
    expect(booking.safeParse({ url, label: 'Pedir cita' }).success).toBe(false);
  });

  it('needs the button text, up to 40 characters', () => {
    const url = 'https://citas.codeqlick.com/es/peluqueria';
    expect(booking.safeParse({ url, label: ' ' }).success).toBe(false);
    expect(booking.safeParse({ url, label: 'x'.repeat(41) }).success).toBe(false);
  });

  it('is optional', () => {
    expect(booking.safeParse(undefined).success).toBe(true);
  });
});
