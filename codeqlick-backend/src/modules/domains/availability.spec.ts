import { describe, expect, it } from 'vitest';
import { availableFromRdap, candidatesOf, toLabel } from './availability.js';

describe('toLabel', () => {
  it('drops accents, spaces and symbols', () => {
    expect(toLabel('Peluquería Ñandú & Co.')).toBe('peluqueria-nandu-co');
  });
});

describe('candidatesOf', () => {
  it('checks a label in each offered TLD', () => {
    expect(candidatesOf('Peluquería Ana')).toEqual([
      'peluqueria-ana.com',
      'peluqueria-ana.es',
      'peluqueria-ana.eu',
    ]);
  });
  it('checks a full domain first, then its label elsewhere', () => {
    expect(candidatesOf('https://www.casalola.com/')).toEqual([
      'casalola.com',
      'casalola.es',
      'casalola.eu',
    ]);
    expect(candidatesOf('fisio.cat')).toEqual(['fisio.cat', 'fisio.com', 'fisio.es', 'fisio.eu']);
  });
  it('refuses what has no usable label', () => {
    expect(candidatesOf('---')).toBeNull();
    expect(candidatesOf('foo.1')).toBeNull();
  });
});

describe('availableFromRdap', () => {
  it('maps the registry answer', () => {
    expect(availableFromRdap(404)).toBe(true);
    expect(availableFromRdap(200)).toBe(false);
    expect(availableFromRdap(429)).toBeNull();
  });
});
