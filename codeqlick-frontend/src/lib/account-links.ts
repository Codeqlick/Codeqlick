import 'server-only';
import { env } from '@/lib/env';
import { accountHref } from './account-host';

/** Whether single sign-on through the account host is on (decision 108; off on staging). */
export const ssoEnabled = env.ACCOUNT_SSO === 'true';

/**
 * A page of the account site (architecture 6.5), absolute on the account host next to SITE_URL:
 * `accountUrl('es', '/security')` → `https://account.codeqlick.com/es/security`. Without single
 * sign-on, the same page under `/{locale}/account` on this host.
 */
export function accountUrl(locale: string, path = ''): string {
  const site = new URL(env.SITE_URL);
  return accountHref(locale, path, { host: site.host, protocol: site.protocol }, ssoEnabled);
}

/**
 * A page of the account site as a locale-less `Link` href from the account site itself: `/security`
 * on the account host, `/account/security` without single sign-on.
 */
export function accountPath(path: string): string {
  if (!ssoEnabled) return `/account${path}`;
  return path || '/';
}
