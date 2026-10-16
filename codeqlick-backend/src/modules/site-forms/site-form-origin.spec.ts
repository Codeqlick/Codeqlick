import { describe, expect, it } from 'vitest';
import { allowedOrigins, originOf, returnUrl } from './site-form-origin.js';

describe('site form origins', () => {
  const allowed = allowedOrigins(['https://peluqueria.es/', 'https://staging.peluqueria.es', null]);

  it('keeps the origins of the project addresses', () => {
    expect(allowed).toEqual(['https://peluqueria.es', 'https://staging.peluqueria.es']);
    expect(originOf('javascript:alert(1)')).toBeNull();
    expect(originOf('not a url')).toBeNull();
  });

  it('returns to a page of the site with the result, keeping its anchor', () => {
    expect(returnUrl(['https://peluqueria.es/contacto#form'], allowed, 'ok')).toBe(
      'https://peluqueria.es/contacto?form=ok#form',
    );
    expect(returnUrl([undefined, 'https://peluqueria.es/?form=ok'], allowed, 'error')).toBe(
      'https://peluqueria.es/?form=error',
    );
  });

  it('never redirects off the site', () => {
    expect(
      returnUrl(['https://evil.example/', 'https://evil.example/x'], allowed, 'ok'),
    ).toBeNull();
    expect(
      returnUrl(['https://evil.example/', 'https://staging.peluqueria.es/'], allowed, 'ok'),
    ).toBe('https://staging.peluqueria.es/?form=ok');
  });
});
