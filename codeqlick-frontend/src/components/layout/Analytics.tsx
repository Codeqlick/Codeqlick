import { headers } from 'next/headers';
import { env } from '@/lib/env';

/**
 * Umami's tracker (cookieless, no personal data), served from this site through /api/stats.
 * Only on the public site, only where the site is really served, and not for visitors who ask
 * not to be tracked. The tag carries the response's CSP nonce (architecture 6.4).
 */
export async function Analytics() {
  if (!env.UMAMI_URL || !env.UMAMI_WEBSITE_ID) return null;
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <script
      nonce={nonce}
      defer
      src="/api/stats/script.js"
      data-website-id={env.UMAMI_WEBSITE_ID}
      data-host-url="/api/stats"
      data-domains={new URL(env.SITE_URL).hostname}
      data-do-not-track="true"
    />
  );
}
