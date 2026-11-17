import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE_LOCALES, routing } from '@/i18n/routing';
import {
  appLocales,
  intlLocale,
  localeOf,
  localeRedirect,
  LOCALE_NAMES,
  requestLocales,
} from './locales';
import { routeWebapp } from './webapps';

describe('languages per host (decision 103)', () => {
  beforeEach(() => vi.stubEnv('NEOQLICK_URL', 'https://neoqlick.com'));
  afterEach(() => vi.unstubAllEnvs());

  it('reads the locale prefix and the section after it', () => {
    expect(localeOf('/fr/map')).toEqual({ locale: 'fr', section: 'map' });
    expect(localeOf('/pt')).toEqual({ locale: 'pt', section: '' });
    expect(localeOf('/nl/map')).toBeNull();
    expect(localeOf('/france')).toBeNull();
  });

  it('serves the six languages on Cruising and two everywhere else', () => {
    expect(requestLocales('/de/map', 'cruising')).toEqual(routing.locales);
    expect(requestLocales('/de/cruising/map', null)).toEqual(routing.locales);
    expect(requestLocales('/de/about', null)).toEqual(SITE_LOCALES);
    expect(requestLocales('/de/room', 'videochat')).toEqual(SITE_LOCALES);
    expect(appLocales('cruising')).toHaveLength(6);
    expect(appLocales('swipe')).toEqual(['en', 'es']);
    expect(appLocales(null)).toEqual(['en', 'es']);
  });

  it('sends a language a host does not speak to the same page in English', () => {
    expect(localeRedirect('/fr', null)).toBe('/en');
    expect(localeRedirect('/fr/about', null)).toBe('/en/about');
    expect(localeRedirect('/de/portal/projects/1', null)).toBe('/en/portal/projects/1');
    expect(localeRedirect('/it/admin', null)).toBe('/en/admin');
    expect(localeRedirect('/pt/room', 'videochat')).toBe('/en/room');
    expect(localeRedirect('/pt/deck', 'swipe')).toBe('/en/deck');
    expect(localeRedirect('/fr/console', 'cloud')).toBe('/en/console');
  });

  it("leaves Cruising's languages on Cruising, and the website's everywhere", () => {
    for (const path of ['/fr', '/de/map', '/it/spots/x', '/pt/login', '/fr/rules']) {
      expect(localeRedirect(path, 'cruising')).toBeNull();
    }
    // The main host sends these to Cruising's host, in the same language.
    expect(localeRedirect('/fr/cruising/map', null)).toBeNull();
    expect(localeRedirect('/es/about', null)).toBeNull();
    expect(localeRedirect('/en/room', 'videochat')).toBeNull();
    expect(localeRedirect('/about', null)).toBeNull();
  });

  it("keeps the language crossing to Cruising's host and drops it leaving it", () => {
    expect(routeWebapp('/fr/cruising/map', 'neoqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://cruising.neoqlick.com/fr/map',
    });
    expect(routeWebapp('/de/map', 'cruising.neoqlick.com', 'https:')).toEqual({
      action: 'rewrite',
      to: '/de/cruising/map',
    });
    expect(routeWebapp('/it/cruising/map', 'cruising.neoqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: '/it/map',
    });
    // The website's sections and the other apps only speak English and Spanish.
    expect(routeWebapp('/fr/about', 'cruising.neoqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://neoqlick.com/en/about',
    });
    expect(routeWebapp('/pt/swipe', 'cruising.neoqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://neoqlick.com/en/swipe',
    });
    expect(routeWebapp('/es/about', 'cruising.neoqlick.com', 'https:')).toEqual({
      action: 'redirect',
      to: 'https://neoqlick.com/es/about',
    });
    // Sign-in pages are shared: served on Cruising's host in its language.
    expect(routeWebapp('/fr/login', 'cruising.neoqlick.com', 'https:')).toEqual({
      action: 'pass',
    });
  });

  it('names each language by its own name and formats dates in it', () => {
    expect(Object.keys(LOCALE_NAMES)).toEqual([...routing.locales]);
    expect(LOCALE_NAMES.de).toBe('Deutsch');
    expect(intlLocale('pt')).toBe('pt-PT');
    expect(intlLocale('en')).toBe('en-GB');
    expect(intlLocale('xx')).toBe('en-GB');
  });
});
