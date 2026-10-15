import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { routing, type AppLocale } from './routing';

/** Narrows a `[locale]` route param to a supported locale, or renders the 404 page. */
export function resolveLocale(value: string): AppLocale {
  if (!hasLocale(routing.locales, value)) notFound();
  return value;
}

/** Narrows an untrusted value (form field, header) to a locale, falling back to the default. */
export function localeOrDefault(value: unknown): AppLocale {
  return hasLocale(routing.locales, value) ? value : routing.defaultLocale;
}
