import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { SITE_LOCALES, routing, type AppLocale, type SiteLocale } from './routing';

/**
 * Narrows a `[locale]` route param to one of the website's locales (English or Spanish), or renders
 * the 404 page: every page but Cruising's (and the sign-in pages its host shares) is only in those
 * two (decision 103), so `/fr/about` never renders even if it gets past the proxy.
 */
export function resolveLocale(value: string): SiteLocale {
  if (!hasLocale(SITE_LOCALES, value)) notFound();
  return value;
}

/** Narrows a `[locale]` route param to any of Cruising's six locales, or renders the 404 page. */
export function resolveCruisingLocale(value: string): AppLocale {
  if (!hasLocale(routing.locales, value)) notFound();
  return value;
}

/** Narrows an untrusted value (form field, header) to a website locale, falling back to English. */
export function localeOrDefault(value: unknown): SiteLocale {
  return hasLocale(SITE_LOCALES, value) ? value : 'en';
}

/** Narrows an untrusted value to any of Cruising's six locales, falling back to English. */
export function cruisingLocaleOrDefault(value: unknown): AppLocale {
  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}
