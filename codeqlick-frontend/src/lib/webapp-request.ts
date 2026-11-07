import 'server-only';
import { headers } from 'next/headers';
import type { Role } from '@/lib/api/types';
import { homeForRole } from '@/lib/auth/session';
import { webappForHost, type Webapp } from '@/lib/webapps';

/** The web app whose host this request came to (videochat.codeqlick.com → videochat), or null. */
export async function requestWebapp(): Promise<Webapp | null> {
  return webappForHost((await headers()).get('host'));
}

/**
 * Where to land after signing in or up: the web app's home on its host (the portal and the admin
 * live on the main host, where this host's cookies don't reach), else the role's home.
 */
export async function homeAfterSignIn(locale: string, role: Role): Promise<string> {
  const app = await requestWebapp();
  return app ? `/${locale}/${app}` : homeForRole(locale, role);
}
