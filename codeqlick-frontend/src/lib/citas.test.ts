import { describe, expect, it } from 'vitest';
import { isValidSlug, slotsByDay, slugify, zoneCity } from './citas';

describe('slugify', () => {
  it('turns a title into a link', () => {
    expect(slugify('Corte de pelo · Ana')).toBe('corte-de-pelo-ana');
    expect(slugify('  Clase de prueba (60 min)  ')).toBe('clase-de-prueba-60-min');
    expect(slugify('Peluquería Ñandú')).toBe('peluqueria-nandu');
  });
});

describe('isValidSlug', () => {
  it('takes what the API takes', () => {
    expect(isValidSlug('pelu-ana')).toBe(true);
    expect(isValidSlug('ab')).toBe(false);
    expect(isValidSlug('pelu--ana')).toBe(false);
    expect(isValidSlug('Pelu')).toBe(false);
    expect(isValidSlug('cancelar')).toBe(false);
  });
});

describe('slotsByDay', () => {
  it('groups by day in the page’s time zone', () => {
    const slots = ['2026-11-09T22:30:00Z', '2026-11-09T23:30:00Z', '2026-11-10T09:00:00Z'];
    expect(slotsByDay(slots, 'Europe/Madrid')).toEqual([
      ['2026-11-09', ['2026-11-09T22:30:00Z']],
      ['2026-11-10', ['2026-11-09T23:30:00Z', '2026-11-10T09:00:00Z']],
    ]);
  });
});

describe('zoneCity', () => {
  it('names the city of a zone', () => {
    expect(zoneCity('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(zoneCity('UTC')).toBe('UTC');
  });
});
