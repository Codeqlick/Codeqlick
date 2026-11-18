import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { SITE_LOCALES, type SiteLocale } from './routing';

/** Narrows a `[locale]` route param to one of the website's locales, or renders the 404 page. */
export function resolveLocale(value: string): SiteLocale {
  if (!hasLocale(SITE_LOCALES, value)) notFound();
  return value;
}

/** Narrows an untrusted value (form field, header) to a website locale, falling back to English. */
export function localeOrDefault(value: unknown): SiteLocale {
  return hasLocale(SITE_LOCALES, value) ? value : 'en';
}
