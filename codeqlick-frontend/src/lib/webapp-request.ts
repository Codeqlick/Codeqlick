import 'server-only';
import { headers } from 'next/headers';
import type { Role } from '@/lib/api/types';
import { homeForRole } from '@/lib/auth/session';
import { ACCOUNT, isAccountHost } from '@/lib/account-host';
import { publicPath, webappForHost, type Webapp } from '@/lib/webapps';

/** The web app whose host this request came to (meetings.codeqlick.com → meetings), or null. */
export async function requestWebapp(): Promise<Webapp | null> {
  return webappForHost((await headers()).get('host'));
}

/**
 * Where to land after signing in or up: the web app's home on its host (`/{locale}`) (the portal and the admin
 * live on the main host, where this host's cookies don't reach), else the role's home.
 */
export async function homeAfterSignIn(locale: string, role: Role): Promise<string> {
  const app = await requestWebapp();
  // The account host's home is its overview (decision 108).
  return app || (await onAccountHost()) ? `/${locale}` : homeForRole(locale, role);
}

/** Whether this request came to the account host (account.codeqlick.com, decision 108). */
export async function onAccountHost(): Promise<boolean> {
  return isAccountHost((await headers()).get('host'));
}

/**
 * A route path (`/{locale}/meetings/rooms`) as the short address on this app's host (`/{locale}/room`),
 * for redirects: a Server Action's redirect doesn't pass through the proxy's redirect of old addresses.
 */
export async function appPath(path: string, locale: string): Promise<string> {
  if ((await onAccountHost()) && path.startsWith(`/${locale}/${ACCOUNT}`)) {
    const rest = path.slice(locale.length + ACCOUNT.length + 2);
    if (rest === '' || rest.startsWith('/') || rest.startsWith('?')) return `/${locale}${rest}`;
  }
  const app = await requestWebapp();
  if (!app || !path.startsWith(`/${locale}/`)) return path;
  return `/${locale}${publicPath(app, path.slice(locale.length + 1))}`;
}

/** A `next` path to land on after signing in, as the short address on an app's host. */
export async function shortNext(next: string | null, locale: string): Promise<string | null> {
  return next ? appPath(next, locale) : null;
}
