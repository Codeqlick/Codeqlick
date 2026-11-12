import 'server-only';
import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';
import { env } from '@/lib/env';
import { webappHost, type Webapp } from '@/lib/webapps';

/** The web app's own origin next to SITE_URL: https://codeqlick.com → https://videochat.codeqlick.com */
export function webappOrigin(app: Webapp): string {
  const site = new URL(env.SITE_URL);
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
  for (const l of routing.locales) languages[l] = webappUrl(app, l, path);
  languages['x-default'] = webappUrl(app, routing.defaultLocale, path);
  return { canonical: webappUrl(app, locale, path), languages };
}

/** The web app's public pages, the only ones its host lists in sitemap.xml (locale-less paths). */
export const WEBAPP_PUBLIC_PATHS: Partial<Record<Webapp, string[]>> = {
  videochat: ['', '/rules'],
  swipe: ['', '/rules', '/takedown'],
  cloud: ['', '/docs', '/terms-of-use'],
};
