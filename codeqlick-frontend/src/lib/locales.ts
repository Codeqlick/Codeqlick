/**
 * Which languages each host speaks (decision 103): Cruising's host all six of `routing.locales`,
 * every other host (the website, the portal, the admin, the other apps) English and Spanish only.
 * Pure functions: the proxy, the links and the language switcher use them.
 */
import {
  CRUISING_LOCALES,
  CRUISING_ONLY_LOCALES,
  SITE_LOCALES,
  routing,
  type AppLocale,
} from '@/i18n/routing';
import { classifyHost } from './hosts';
import { webappForHost, type Webapp } from './webapps';

/**
 * What a host serves for its languages: a web app, the account host (decision 108), Neoqlick's
 * portal (architecture 4.18) or the site.
 */
export type HostApp = Webapp | 'account' | 'portal' | null;

/** The app of a host, `account` for an account host, `portal` for Neoqlick's, null for the website. */
export function hostApp(host: string | null | undefined): HostApp {
  if (host?.split(':')[0]?.split('.')[0]?.toLowerCase() === 'account') return 'account';
  if (classifyHost(host).kind === 'portal') return 'portal';
  return webappForHost(host);
}

/** Whether a host speaks all six languages: Cruising's, the account host's and Neoqlick's portal. */
function speaksAll(app: HostApp): boolean {
  return app === 'cruising' || app === 'account' || app === 'portal';
}

/** `en|es|fr|de|it|pt`, for the patterns that read a locale prefix. */
export const LOCALE_PATTERN = routing.locales.join('|');

const LOCALE_PREFIX = new RegExp(`^/(${LOCALE_PATTERN})(?=/|$)(?:/([^/]*))?`);

/** The locale prefix of a path and the section after it (`/fr/map` → fr, map), or null. */
export function localeOf(pathname: string): { locale: AppLocale; section: string } | null {
  const match = LOCALE_PREFIX.exec(pathname);
  if (!match) return null;
  return { locale: match[1] as AppLocale, section: match[2] ?? '' };
}

/** Whether a locale is one of Cruising's own (fr, de, it, pt). */
export function isCruisingOnlyLocale(locale: string): boolean {
  return (CRUISING_ONLY_LOCALES as readonly string[]).includes(locale);
}

/**
 * The languages a request may be served in: all six on Cruising's and the account's hosts and on
 * Cruising's and the account's routes (`/fr/cruising/…`, which the main host sends to Cruising's
 * host and Next.js fetches from itself by its IP address), English and Spanish everywhere else.
 */
export function requestLocales(pathname: string, app: HostApp): readonly AppLocale[] {
  const section = localeOf(pathname)?.section;
  if (speaksAll(app)) return CRUISING_LOCALES;
  if (section === 'cruising' || section === 'account' || section === 'neoqlick') {
    return CRUISING_LOCALES;
  }
  return SITE_LOCALES;
}

/**
 * Where a request in a language its host doesn't speak goes: the same path in English
 * (`/fr/about` on codeqlick.com → `/en/about`), or null when it is served as it is.
 */
export function localeRedirect(pathname: string, app: HostApp): string | null {
  const prefix = localeOf(pathname);
  if (!prefix || requestLocales(pathname, app).includes(prefix.locale)) return null;
  return `/${routing.defaultLocale}${pathname.slice(prefix.locale.length + 1)}`;
}

/** The languages a host's language switcher, sitemap and hreflang list. */
export function appLocales(app: HostApp): readonly AppLocale[] {
  return speaksAll(app) ? CRUISING_LOCALES : SITE_LOCALES;
}

/** Each language by its own name, as Cruising's language switcher lists them. */
export const LOCALE_NAMES: Record<AppLocale, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
};

const INTL_LOCALES: Record<AppLocale, string> = {
  en: 'en-GB',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-PT',
};

/** The language tag dates and numbers are written with (British English for English). */
export function intlLocale(locale: string): string {
  return INTL_LOCALES[locale as AppLocale] ?? INTL_LOCALES.en;
}
