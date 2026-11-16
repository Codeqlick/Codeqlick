/**
 * The account host, account.codeqlick.com (architecture 6.5, decision 108): where people sign in,
 * sign up, recover their account and change its settings. Every other host gets its session from
 * it by single sign-on (`lib/sso.ts`). Pure functions: the proxy, route handlers and links use
 * them, so no `server-only` and no env module here (the proxy reads `ACCOUNT_SSO` itself).
 *
 * On its host `/{locale}/…` is the route `/{locale}/account/…` (like a web app's host); the sign-in
 * pages are served as they are.
 */
import { routing } from '@/i18n/routing';
import { isCruisingOnlyLocale, localeOf } from './locales';
import { SITE_SECTIONS, WEBAPPS, webappForHost, type WebappRoute } from './webapps';

/** The account host's first label, and its pages' route folder (`app/[locale]/account`). */
export const ACCOUNT = 'account';

/**
 * Pages the account host serves as they are (not as account routes): signing in and up,
 * recovering the account, confirming an email change, and single sign-on's own pages.
 */
export const ACCOUNT_HOST_PAGES = [
  'login',
  'register',
  'forgot-password',
  'reset-password',
  'confirm-email',
  'auth',
];

/**
 * The account site's own pages (route folders under `app/[locale]/account`): on its host they win
 * over the website's sections of the same name (`/security`, `/privacy`).
 */
export const ACCOUNT_ROUTES = [
  '',
  'profile',
  'security',
  'privacy',
  'notifications',
  'apps',
  'export',
];

/** Whether `host` is the account host (`account.codeqlick.com`, `account.localhost:3000`). */
export function isAccountHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return host.split(':')[0]?.split('.')[0]?.toLowerCase() === ACCOUNT;
}

/**
 * The main site's host next to any of its hosts: `account.codeqlick.com` and
 * `cruising.codeqlick.com` → `codeqlick.com`; `www.codeqlick.com` → `codeqlick.com`.
 */
export function mainHostOf(host: string): string {
  if (isAccountHost(host)) return host.slice(ACCOUNT.length + 1);
  const app = webappForHost(host);
  if (app) return host.slice(app.length + 1);
  return host.replace(/^www\./, '');
}

/** The account host next to any host of the platform: `cruising.codeqlick.com` → `account.codeqlick.com`. */
export function accountHostFor(host: string): string {
  return `${ACCOUNT}.${mainHostOf(host)}`;
}

/** `127.0.0.1:3000`, `[::1]:3000`: hosts that can't have a subdomain (Next.js calling itself). */
export function isIpHost(host: string): boolean {
  const name = host.startsWith('[') ? host : (host.split(':')[0] ?? '');
  return name.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(name);
}

/**
 * Where a request goes on the account host:
 * - the sign-in pages and single sign-on's pages are served as they are;
 * - the old addresses with the folder's name (`/{locale}/account/…`) go to the short ones, on
 *   navigations (`redirectOld`);
 * - the website's sections and the apps go to the main host (which sends apps on to theirs), in
 *   English when the language is one only Cruising speaks;
 * - the account pages: `/{locale}/security` is the route `/{locale}/account/security`; anything
 *   else is left to the account routes too (their 404).
 */
export function routeAccount(
  pathname: string,
  host: string,
  protocol: string,
  redirectOld = true,
): WebappRoute {
  const prefix = localeOf(pathname);
  if (!prefix) return { action: 'pass' };
  const { locale, section } = prefix;
  const rest = pathname.slice(locale.length + 1); // '', '/', '/security', '/account/security'…
  if (ACCOUNT_HOST_PAGES.includes(section)) return { action: 'pass' };
  // Single sign-on's authorize step is a page of its own (`app/[locale]/auth/authorize`).
  if (section === 'authorize') return { action: 'rewrite', to: `/${locale}/auth${rest}` };
  if (ACCOUNT_ROUTES.includes(section)) {
    return { action: 'rewrite', to: `/${locale}/${ACCOUNT}${rest === '/' ? '' : rest}` };
  }
  if (section === ACCOUNT) {
    if (!redirectOld) return { action: 'pass' };
    return { action: 'redirect', to: `/${locale}${rest.slice(ACCOUNT.length + 1)}` };
  }
  if (SITE_SECTIONS.includes(section) || WEBAPPS.some((app) => app === section)) {
    const path =
      section !== 'cruising' && isCruisingOnlyLocale(locale)
        ? `/${routing.defaultLocale}${rest}`
        : pathname;
    return { action: 'redirect', to: `${protocol}//${mainHostOf(host)}${path}` };
  }
  return { action: 'rewrite', to: `/${locale}/${ACCOUNT}${rest === '/' ? '' : rest}` };
}

/**
 * A page of the account site as linked from any host: on the account host (`https://account.…`)
 * while single sign-on is on, else on the same host under `/{locale}/account` (staging, which has
 * no account host). `path` starts with `/` or is empty (the overview).
 */
export function accountHref(
  locale: string,
  path: string,
  origin: { host: string; protocol: string } | null,
  sso = true,
): string {
  if (!sso || !origin) return `/${locale}/${ACCOUNT}${path}`;
  return `${origin.protocol}//${accountHostFor(origin.host)}/${locale}${path}`;
}
