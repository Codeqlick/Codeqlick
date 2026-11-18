import { describe, expect, it } from 'vitest';
import { routing } from '@/i18n/routing';
import { hostApp, intlLocale, localeOf, LOCALE_NAMES } from './locales';

describe('languages', () => {
  it('speaks English and Spanish everywhere', () => {
    expect([...routing.locales]).toEqual(['en', 'es']);
  });

  it('reads the locale prefix and the section after it', () => {
    expect(localeOf('/es/room')).toEqual({ locale: 'es', section: 'room' });
    expect(localeOf('/en')).toEqual({ locale: 'en', section: '' });
    expect(localeOf('/fr/room')).toBeNull();
    expect(localeOf('/english')).toBeNull();
  });

  it('tells the account host and the web apps apart', () => {
    expect(hostApp('account.codeqlick.com')).toBe('account');
    expect(hostApp('meetings.codeqlick.com:443')).toBe('meetings');
    expect(hostApp('codeqlick.com')).toBeNull();
  });

  it('names each language by its own name and formats dates in it', () => {
    expect(Object.keys(LOCALE_NAMES)).toEqual([...routing.locales]);
    expect(LOCALE_NAMES.es).toBe('Español');
    expect(intlLocale('es')).toBe('es-ES');
    expect(intlLocale('en')).toBe('en-GB');
    expect(intlLocale('xx')).toBe('en-GB');
  });
});
