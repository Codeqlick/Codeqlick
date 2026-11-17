import 'server-only';
import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';
import { appLocales } from '@/lib/locales';
import { env } from '@/lib/env';
import { NEOQLICK_APPS, webappHost, type Webapp } from '@/lib/webapps';

/**
 * The web app's own origin: Neoqlick's apps next to NEOQLICK_URL (https://neoqlick.com →
 * https://cruising.neoqlick.com), where there are Neoqlick hosts; every other app next to SITE_URL
 * (https://codeqlick.com → https://meetings.codeqlick.com).
 */
export function webappOrigin(app: Webapp): string {
  const neoqlick = NEOQLICK_APPS.some((name) => name === app) && env.NEOQLICK_URL;
  const site = new URL(neoqlick || env.SITE_URL);
  return `${site.protocol}//${webappHost(app, site.host)}`;
}

/**
 * A page of the web app as people (and search engines) reach it on its host, without the origin:
 * `webappPath('videochat', 'es', '/rules')` → `/es/rules` (the proxy rewrites it to the app's route).
 */
export function webappPath(_app: Webapp, locale: string, path = ''): string {
  return `/${locale}${path}`;
}

/** Absolute URL of a page of the web app on its host. */
export function webappUrl(app: Webapp, locale: string, path = ''): string {
  return `${webappOrigin(app)}${webappPath(app, locale, path)}`;
}

/** Canonical + hreflang (x-default: the default locale) of a web app's page, absolute on its host. */
export function webappAlternates(
  app: Webapp,
  locale: string,
  path = '',
): NonNullable<Metadata['alternates']> {
  const languages: Record<string, string> = {};
  // Cruising lists its six languages, the other apps English and Spanish (decision 103).
  for (const l of appLocales(app)) languages[l] = webappUrl(app, l, path);
  languages['x-default'] = webappUrl(app, routing.defaultLocale, path);
  return { canonical: webappUrl(app, locale, path), languages };
}

/** The web app's public pages, the only ones its host lists in sitemap.xml (locale-less paths). */
export const WEBAPP_PUBLIC_PATHS: Partial<Record<Webapp, string[]>> = {
  videochat: ['', '/rules'],
  swipe: ['', '/rules', '/takedown'],
  // Spots and place pages are added from the API's sitemap (app/sitemap.ts).
  cruising: [
    '',
    '/map',
    '/places',
    '/health',
    '/rules',
    '/takedown',
    '/terms-of-use',
    '/privacy-policy',
  ],
  // With the public documentation site set up, /docs only redirects: not listed.
  cloud: env.CLOUD_DOCS_URL ? ['', '/terms-of-use'] : ['', '/docs', '/terms-of-use'],
};
