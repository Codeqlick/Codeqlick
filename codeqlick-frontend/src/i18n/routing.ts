import { defineRouting } from 'next-intl/routing';

/**
 * Every locale the app knows. The website and every other app speak English and Spanish
 * (`SITE_LOCALES`); Cruising also French, German, Italian and Portuguese (decision 103). The proxy
 * keeps each host to its own (`src/lib/locales.ts`).
 */
export const routing = defineRouting({
  locales: ['en', 'es', 'fr', 'de', 'it', 'pt'],
  defaultLocale: 'en',
  localePrefix: 'always',
});

export type AppLocale = (typeof routing.locales)[number];

/** The website's languages (and every app's but Cruising's). */
export const SITE_LOCALES = ['en', 'es'] as const satisfies readonly AppLocale[];
export type SiteLocale = (typeof SITE_LOCALES)[number];

/** Cruising's languages: all of them. */
export const CRUISING_LOCALES = routing.locales;

/** The languages only Cruising speaks. */
export const CRUISING_ONLY_LOCALES = [
  'fr',
  'de',
  'it',
  'pt',
] as const satisfies readonly AppLocale[];

/** A locale as the website's: Cruising's extra languages fall back to English. */
export function siteLocale(locale: string): SiteLocale {
  return locale === 'es' ? 'es' : 'en';
}

/** Open Graph's `og:locale` of each language. */
export const OG_LOCALES: Record<AppLocale, string> = {
  en: 'en_US',
  es: 'es_ES',
  fr: 'fr_FR',
  de: 'de_DE',
  it: 'it_IT',
  pt: 'pt_PT',
};
