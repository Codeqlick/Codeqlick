/**
 * Codeqlick's own web apps, each on its subdomain (videochat.codeqlick.com, …) and served by this
 * same Next.js app under /{locale}/<app> (architecture 6.3). On its host an app's addresses don't
 * repeat its name: videochat.codeqlick.com/es/room is the route /es/videochat/room. Pure
 * functions: the proxy and the links use them, so no `server-only` and no env module here.
 *
 * Adding an app: its name here and in the API's WEBAPPS, and its pages under `app/[locale]/<name>/`.
 * The release publishes <name>.codeqlick.com (DNS, Nginx, certificate) by itself.
 */
import { routing } from '@/i18n/routing';
import { CODEQLICK_APPS, NEOQLICK_APPS, brandOfHost, neoqlickMainHost, type Brand } from './hosts';
import { isCruisingOnlyLocale, localeOf } from './locales';

export { CODEQLICK_APPS, NEOQLICK_APPS };

export const WEBAPPS = ['videochat', 'meetings', 'citas', 'swipe', 'cruising', 'cloud'] as const;
export type Webapp = (typeof WEBAPPS)[number];

/** The apps of a brand: Neoqlick's three, or Codeqlick's three (architecture 4.18). */
export function appsOfBrand(brand: Brand): readonly Webapp[] {
  return brand === 'neoqlick' ? NEOQLICK_APPS : CODEQLICK_APPS;
}

/**
 * The apps the "Apps" menu lists inside `current`: the other apps of its brand, and nothing of
 * the other brand (the 18+ apps live on Neoqlick's hosts and Codeqlick's never list them).
 */
export function switcherApps(current: Webapp, brand: Brand = 'codeqlick'): { app: Webapp }[] {
  return appsOfBrand(brand)
    .filter((app) => app !== current)
    .map((app) => ({ app }));
}

/**
 * Where a Neoqlick app's old address on Codeqlick's hosts goes (decision 130): the same path and
 * query on `<app>.neoqlick.com`. `null` where there are no Neoqlick hosts (staging).
 */
function neoqlickAppUrl(
  app: Webapp,
  locale: string,
  rest: string,
  protocol: string,
): string | null {
  const main = neoqlickMainHost();
  if (!main) return null;
  return `${protocol}//${webappHost(app, main)}/${locale}${publicPath(app, rest)}`;
}

/**
 * Safety net for the old app hosts (`cruising.codeqlick.com`…) while Nginx hasn't switched to its
 * redirect blocks, and for any request that reaches the website on them: a permanent redirect to
 * the same path and query on the Neoqlick host. `null` when `host` is not such a host.
 */
export function legacyAppHostRedirect(
  pathname: string,
  search: string,
  host: string,
  protocol: string,
): string | null {
  const first = host.split(':')[0]?.split('.')[0]?.toLowerCase();
  const app = NEOQLICK_APPS.find((name) => name === first);
  const main = neoqlickMainHost();
  if (!app || !main || isIpHost(host) || brandOfHost(host) !== 'codeqlick') return null;
  // `/{locale}/<app>/…` (the old address with the app's name) is the short one on the new host.
  const prefix = localeOf(pathname);
  const path =
    prefix && prefix.section === app
      ? `/${prefix.locale}${publicPath(app, pathname.slice(prefix.locale.length + 1))}`
      : pathname;
  return `${protocol}//${webappHost(app, main)}${path}${search}`;
}

/**
 * Pages of the main site a web app's host also serves: single sign-on's callback (`auth`,
 * decision 108) and, while single sign-on is off (staging), signing in and creating the account.
 */
export const SHARED_PAGES = ['login', 'register', 'forgot-password', 'reset-password', 'auth'];

/**
 * The main site's other sections (`app/[locale]/…`): on an app's host they go to the main host
 * instead of being read as the app's addresses. Kept in sync with the folders by a test; the
 * API's Citas reserves them as page links.
 */
export const SITE_SECTIONS = [
  'about',
  'account',
  'admin',
  'apps',
  'basic-website',
  'blog',
  'book',
  'calculator',
  'confirm-email',
  'contact',
  'email',
  'legal',
  'newsletter',
  'portal',
  'privacy',
  'safety-contact',
  'security',
  'services',
  'terms',
  'website-check',
  'work',
];

/** The web app whose subdomain `host` is (`videochat.codeqlick.com:443` → videochat), or null. */
export function webappForHost(host: string | null | undefined): Webapp | null {
  if (!host) return null;
  const first = host.split(':')[0]?.split('.')[0]?.toLowerCase();
  // Neoqlick's hosts have only Neoqlick's apps (`meetings.neoqlick.com` is no app).
  return appsOfBrand(brandOfHost(host)).find((app) => app === first) ?? null;
}

/** The host of a web app next to the main site's host: codeqlick.com → videochat.codeqlick.com. */
export function webappHost(app: Webapp, mainHost: string): string {
  return `${app}.${mainHost.replace(/^www\./, '')}`;
}

/** `127.0.0.1:3000`, `[::1]:3000`: hosts that can't have a subdomain. */
function isIpHost(host: string): boolean {
  const name = host.startsWith('[') ? host : (host.split(':')[0] ?? '');
  return name.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(name);
}

export type WebappRoute =
  /** Leave it to the normal routing. */
  | { action: 'pass' }
  /** Serve this route (a path) while the browser keeps its address. */
  | { action: 'rewrite'; to: string }
  /** Send the browser elsewhere: a path on this host, or a full URL. */
  | { action: 'redirect'; to: string };

/**
 * Where a request goes, for web apps:
 * - on an app's host: `/{locale}/…` is the app's route `/{locale}/<app>/…` (rewritten), the shared
 *   pages are served as they are, the site's other sections go to the main host, and the old
 *   addresses with the app's name (`/{locale}/<app>/…`) are sent to the short ones. `redirectOld` is false for requests that aren't navigations
 *   (images, form posts): those are served without a round trip;
 * - on the main host: the app's pages are sent to its host, without the app's name.
 * Paths without a locale are left to next-intl, which adds it first.
 */
export function routeWebapp(
  pathname: string,
  host: string,
  protocol: string,
  redirectOld = true,
): WebappRoute {
  const prefix = localeOf(pathname);
  if (!prefix) return { action: 'pass' };
  const { locale, section } = prefix;
  const rest = pathname.slice(locale.length + 1); // '', '/', '/room', '/videochat/room'…
  const app = webappForHost(host);

  // The 18+ apps left Codeqlick (4.18): their old addresses on the website go to Neoqlick's hosts.
  const legacy = NEOQLICK_APPS.find((name) => name === section);
  if (legacy && brandOfHost(host) === 'codeqlick' && !isIpHost(host)) {
    const to = neoqlickAppUrl(legacy, locale, rest, protocol);
    return to ? { action: 'redirect', to } : { action: 'pass' };
  }

  if (app) {
    if (SHARED_PAGES.includes(section)) return { action: 'pass' };
    if (section === app) {
      if (!redirectOld) return { action: 'pass' };
      return { action: 'redirect', to: `/${locale}${publicPath(app, rest)}` };
    }
    const apps = appsOfBrand(brandOfHost(host));
    if (SITE_SECTIONS.includes(section) || apps.some((name) => name === section)) {
      const mainHost = host.slice(app.length + 1);
      // Only Cruising speaks French, German, Italian and Portuguese: elsewhere they're English.
      const path =
        section !== 'cruising' && isCruisingOnlyLocale(locale)
          ? `/${routing.defaultLocale}${rest}`
          : pathname;
      return { action: 'redirect', to: `${protocol}//${mainHost}${path}` };
    }
    return { action: 'rewrite', to: `/${locale}/${app}${rest === '/' ? '' : rest}` };
  }

  const target = appsOfBrand(brandOfHost(host)).find((name) => name === section);
  // An IP address has no subdomains: Next.js's own requests to itself (127.0.0.1) are served.
  if (!target || isIpHost(host)) return { action: 'pass' };
  const to = `/${locale}${publicPath(target, rest)}`;
  return { action: 'redirect', to: `${protocol}//${webappHost(target, host)}${to}` };
}

/**
 * The address on an app's host of one of its routes, without the locale: `/videochat/room` →
 * `/room`, `/videochat` → `''` (the app's home). Other paths are left as they are.
 */
export function publicPath(app: Webapp, path: string): string {
  if (path === `/${app}`) return '';
  if (path.startsWith(`/${app}/`) || path.startsWith(`/${app}?`) || path.startsWith(`/${app}#`)) {
    return path.slice(app.length + 1);
  }
  return path;
}

/** A link inside an app, as written in the code (`/videochat/room`), for its host: `/room`. */
export function appHref(app: Webapp, href: string): string {
  const short = publicPath(app, href);
  return short === '' || short.startsWith('?') || short.startsWith('#') ? `/${short}` : short;
}

/** The portal's route folder (`app/[locale]/neoqlick`), architecture 4.18. */
export const PORTAL = 'neoqlick';

/**
 * Pages of the website's routes that the portal host serves as they are: Cruising's safety
 * contact page (4.15) and the unsubscribe page of the optional emails (`/email/unsubscribe`).
 */
export const PORTAL_SHARED_PAGES = ['safety-contact', 'email'];

/**
 * Where a request goes on the portal host (`neoqlick.com`): the apps' addresses go to their hosts
 * (without the app's name), the shared pages are served as they are, the old addresses with the
 * folder's name go to the short ones (on navigations), and everything else is the portal's route
 * `/{locale}/neoqlick/...` (its own 404 for what doesn't exist).
 */
export function routePortal(
  pathname: string,
  host: string,
  protocol: string,
  redirectOld = true,
): WebappRoute {
  const prefix = localeOf(pathname);
  if (!prefix) return { action: 'pass' };
  const { locale, section } = prefix;
  const rest = pathname.slice(locale.length + 1);
  if (PORTAL_SHARED_PAGES.includes(section)) return { action: 'pass' };
  if (section === PORTAL) {
    if (!redirectOld) return { action: 'pass' };
    return { action: 'redirect', to: `/${locale}${rest.slice(PORTAL.length + 1)}` };
  }
  const target = NEOQLICK_APPS.find((name) => name === section);
  if (target && !isIpHost(host)) {
    const to = `/${locale}${publicPath(target, rest)}`;
    return { action: 'redirect', to: `${protocol}//${webappHost(target, host)}${to}` };
  }
  return { action: 'rewrite', to: `/${locale}/${PORTAL}${rest === '/' ? '' : rest}` };
}
