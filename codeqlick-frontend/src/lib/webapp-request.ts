import 'server-only';
import { headers } from 'next/headers';
import type { Role } from '@/lib/api/types';
import { homeForRole } from '@/lib/auth/session';
import { publicPath, webappForHost, type Webapp } from '@/lib/webapps';

/** The web app whose host this request came to (videochat.codeqlick.com → videochat), or null. */
export async function requestWebapp(): Promise<Webapp | null> {
  return webappForHost((await headers()).get('host'));
}

/**
 * Where to land after signing in or up: the web app's home on its host (`/{locale}`) (the portal and the admin
 * live on the main host, where this host's cookies don't reach), else the role's home.
 */
export async function homeAfterSignIn(locale: string, role: Role): Promise<string> {
  const app = await requestWebapp();
  return app ? `/${locale}` : homeForRole(locale, role);
}

/**
 * A `next` path (`/{locale}/videochat/room`) as the short address of this host's app (`/{locale}/room`),
 * so signing in doesn't land on the long address: the redirect of a Server Action skips the proxy.
 */
export async function shortNext(next: string | null, locale: string): Promise<string | null> {
  const app = await requestWebapp();
  if (!next || !app) return next;
  const rest = next.slice(locale.length + 1);
  return `/${locale}${publicPath(app, rest)}`;
}
