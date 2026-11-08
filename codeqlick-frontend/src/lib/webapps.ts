/**
 * Codeqlick's own web apps, each on its subdomain (videochat.codeqlick.com, …) and served by this
 * same Next.js app under /{locale}/<app> (architecture 6.3). Pure functions: the proxy uses them,
 * so no `server-only` and no env module here.
 *
 * Adding an app: its name here and in the API's WEBAPPS, and its pages under `app/[locale]/<name>/`.
 * The release publishes <name>.codeqlick.com (DNS, Nginx, certificate) by itself.
 */
export const WEBAPPS = ['videochat', 'meetings', 'citas'] as const;
export type Webapp = (typeof WEBAPPS)[number];

/** Pages of the main site a web app's host also serves: signing in and creating the account. */
const SHARED_PAGES = ['login', 'register', 'forgot-password', 'reset-password'];

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
  /** Send the browser elsewhere: a path on this host, or a full URL. */
  | { action: 'redirect'; to: string };

/**
 * Where a request goes, for web apps:
 * - on an app's host: `/{locale}` opens the app, its pages and the shared ones are served, and
 *   any other page of the site is sent to the main host;
 * - on the main host: the app's pages are sent to its host.
 * Paths without a locale are left to next-intl, which adds it first.
 */
export function routeWebapp(pathname: string, host: string, protocol: string): WebappRoute {
  const match = /^\/(en|es)(?:\/([^/]*))?/.exec(pathname);
  if (!match) return { action: 'pass' };
  const [, locale, section = ''] = match;
  const app = webappForHost(host);

  if (app) {
    if (section === '') return { action: 'redirect', to: `/${locale}/${app}` };
    if (section === app || SHARED_PAGES.includes(section)) return { action: 'pass' };
    const mainHost = host.slice(app.length + 1);
    return { action: 'redirect', to: `${protocol}//${mainHost}${pathname}` };
  }

  const target = WEBAPPS.find((name) => name === section);
  // An IP address has no subdomains: Next.js's own requests to itself (127.0.0.1) are served.
  if (!target || isIpHost(host)) return { action: 'pass' };
  return { action: 'redirect', to: `${protocol}//${webappHost(target, host)}${pathname}` };
}
