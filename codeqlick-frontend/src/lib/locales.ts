/**
 * Locale helpers: which host an app is on, the locale prefix of a path, and how languages are
 * named. Pure functions: the proxy, the links and the language switcher use them.
 */
import { routing, type AppLocale } from '@/i18n/routing';
import { webappForHost, type Webapp } from './webapps';

/** What a host serves for its languages: a web app, the account host (decision 108) or the site. */
export type HostApp = Webapp | 'account' | null;

/** The app of a host, or `account` for the account host, or null for the website. */
export function hostApp(host: string | null | undefined): HostApp {
  if (host?.split(':')[0]?.split('.')[0]?.toLowerCase() === 'account') return 'account';
  return webappForHost(host);
}

/** `en|es`, for the patterns that read a locale prefix. */
export const LOCALE_PATTERN = routing.locales.join('|');

const LOCALE_PREFIX = new RegExp(`^/(${LOCALE_PATTERN})(?=/|$)(?:/([^/]*))?`);

/** The locale prefix of a path and the section after it (`/es/room` → es, room), or null. */
export function localeOf(pathname: string): { locale: AppLocale; section: string } | null {
  const match = LOCALE_PREFIX.exec(pathname);
  if (!match) return null;
  return { locale: match[1] as AppLocale, section: match[2] ?? '' };
}

/** Each language by its own name, as the language switcher lists them. */
export const LOCALE_NAMES: Record<AppLocale, string> = {
  en: 'English',
  es: 'Español',
};

const INTL_LOCALES: Record<AppLocale, string> = {
  en: 'en-GB',
  es: 'es-ES',
};

/** The language tag dates and numbers are written with (British English for English). */
export function intlLocale(locale: string): string {
  return INTL_LOCALES[locale as AppLocale] ?? INTL_LOCALES.en;
}
