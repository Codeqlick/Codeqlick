/**
 * Codeqlick's own web apps, each on its subdomain (videochat.codeqlick.com, …) and served by this
 * same Next.js app under /{locale}/<app> (architecture 6.3). On its host an app's addresses don't
 * repeat its name: videochat.codeqlick.com/es/room is the route /es/videochat/room. Pure
 * functions: the proxy and the links use them, so no `server-only` and no env module here.
 *
 * Adding an app: its name here and in the API's WEBAPPS, and its pages under `app/[locale]/<name>/`.
 * The release publishes <name>.codeqlick.com (DNS, Nginx, certificate) by itself.
 */
export const WEBAPPS = ['videochat', 'meetings', 'citas', 'swipe', 'cloud'] as const;
export type Webapp = (typeof WEBAPPS)[number];

/** The 18+ apps: the other apps' "Apps" menu leaves them out (architecture 6.3). */
export const ADULT_WEBAPPS: readonly Webapp[] = ['videochat', 'swipe'];

/**
 * The apps the "Apps" menu lists inside `current`: every other app from an 18+ app, only the apps
 * for everyone from the others, so a booking page never points at explicit content.
 */
export function switcherApps(current: Webapp): { app: Webapp; adult: boolean }[] {
  const adultContext = ADULT_WEBAPPS.includes(current);
  return WEBAPPS.filter((app) => app !== current && (adultContext || !ADULT_WEBAPPS.includes(app)))
    .map((app) => ({ app, adult: ADULT_WEBAPPS.includes(app) }))
    .sort((a, b) => Number(a.adult) - Number(b.adult));
}

/** Pages of the main site a web app's host also serves: signing in and creating the account. */
const SHARED_PAGES = ['login', 'register', 'forgot-password', 'reset-password'];

/**
 * The main site's other sections (`app/[locale]/…`): on an app's host they go to the main host
 * instead of being read as the app's addresses. Kept in sync with the folders by a test; the
 * API's Citas reserves them as page links.
 */
export const SITE_SECTIONS = [
  'about',
  'admin',
  'apps',
  'basic-website',
  'blog',
  'book',
  'calculator',
  'confirm-email',
  'contact',
  'legal',
  'newsletter',
  'portal',
  'privacy',
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
  return WEBAPPS.find((app) => app === first) ?? null;
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
  const match = /^\/(en|es)(?:\/([^/]*))?/.exec(pathname);
  if (!match) return { action: 'pass' };
  const [, locale, section = ''] = match;
  const rest = pathname.slice(locale.length + 1); // '', '/', '/room', '/videochat/room'…
  const app = webappForHost(host);

  if (app) {
    if (SHARED_PAGES.includes(section)) return { action: 'pass' };
    if (section === app) {
      if (!redirectOld) return { action: 'pass' };
      return { action: 'redirect', to: `/${locale}${publicPath(app, rest)}` };
    }
    if (SITE_SECTIONS.includes(section) || WEBAPPS.some((name) => name === section)) {
      const mainHost = host.slice(app.length + 1);
      return { action: 'redirect', to: `${protocol}//${mainHost}${pathname}` };
    }
    return { action: 'rewrite', to: `/${locale}/${app}${rest === '/' ? '' : rest}` };
  }

  const target = WEBAPPS.find((name) => name === section);
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
