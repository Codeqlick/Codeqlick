import { describe, expect, it } from 'vitest';
import { sharesContact } from './swipe-chat-guard.js';

describe('sharesContact', () => {
  it('finds phone numbers, emails, links, apps and handles', () => {
    for (const text of [
      'llámame al 612 345 678',
      'mi número es +34-612-34-56-78',
      'escríbeme a ana.lopez@gmail.com',
      'ana (at) gmail (dot) com',
      'mira https://example.org/foto',
      'entra en www.algo.es',
      'búscame en misfotos . com',
      'pásame tu WhatsApp',
      'tengo telegram',
      'sígueme en insta',
      'mi only fans',
      'soy @ana_lopez99',
    ]) {
      expect({ text, shares: sharesContact(text) }).toEqual({ text, shares: true });
    }
  });

  it('lets ordinary messages through', () => {
    for (const text of [
      'Hola, ¿qué tal?',
      'Me encantan tus fotos 😍',
      'Tengo 32 años y vivo en Madrid',
      'Nos vemos a las 10.30',
      'Me gusta el cine, la playa y la línea de tu espalda',
      'Hoy es 8/11/2026',
    ]) {
      expect({ text, shares: sharesContact(text) }).toEqual({ text, shares: false });
    }
  });
});
