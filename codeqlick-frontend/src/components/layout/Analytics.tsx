import { headers } from 'next/headers';
import { env } from '@/lib/env';
import { requestBrand } from '@/lib/request-brand';

/**
 * Umami's tracker (cookieless, no personal data), served from this site through /api/stats.
 * Only on the public site and on Neoqlick's portal (each with its own Umami website id), only where
 * the site is really served, and not for visitors who ask not to be tracked. The tag carries the
 * response's CSP nonce (architecture 6.4).
 */
export async function Analytics() {
  const neoqlick = (await requestBrand()) === 'neoqlick';
  const websiteId = neoqlick ? env.NEOQLICK_UMAMI_WEBSITE_ID : env.UMAMI_WEBSITE_ID;
  const siteUrl = neoqlick ? env.NEOQLICK_URL : env.SITE_URL;
  if (!env.UMAMI_URL || !websiteId || !siteUrl) return null;
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <script
      nonce={nonce}
      defer
      src="/api/stats/script.js"
      data-website-id={websiteId}
      data-host-url="/api/stats"
      data-domains={new URL(siteUrl).hostname}
      data-do-not-track="true"
    />
  );
}
