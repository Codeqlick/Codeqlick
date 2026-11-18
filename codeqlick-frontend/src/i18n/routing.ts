import { defineRouting } from 'next-intl/routing';

/** Every locale the app knows: English and Spanish, on every host. */
export const routing = defineRouting({
  locales: ['en', 'es'],
  defaultLocale: 'en',
  localePrefix: 'always',
  // The pages' own hreflang links (metadata) are the only ones: on app hosts the proxy rewrites
  // paths, so next-intl's `Link` header named internal URLs such as /en/meetings/room.
  alternateLinks: false,
});

export type AppLocale = (typeof routing.locales)[number];

/** The website's languages. */
export const SITE_LOCALES = routing.locales;
export type SiteLocale = AppLocale;

/** A locale as the website's (always itself: English and Spanish are all there is). */
export function siteLocale(locale: string): SiteLocale {
  return locale === 'es' ? 'es' : 'en';
}

/** Open Graph's `og:locale` of each language. */
export const OG_LOCALES: Record<AppLocale, string> = {
  en: 'en_US',
  es: 'es_ES',
};
