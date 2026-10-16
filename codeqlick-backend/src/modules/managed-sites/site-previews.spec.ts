import { describe, expect, it } from 'vitest';
import { previewSlugOf } from './site-previews.service.js';

describe('previewSlugOf', () => {
  it('is the business label and six random characters, within 40', () => {
    expect(previewSlugOf('Peluquería Marta', Buffer.from([0, 1, 2, 3, 4, 35]))).toBe(
      'peluqueria-marta-abcde9',
    );
    const long = previewSlugOf('Restaurante Asador de la Abuela Lola y Familia');
    expect(long.length).toBeLessThanOrEqual(40);
    expect(long).toMatch(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/);
    expect(previewSlugOf('¡¡¡')).toMatch(/^web-[a-z0-9]{6}$/);
  });
});
