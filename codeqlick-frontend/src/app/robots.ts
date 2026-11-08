import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { absoluteUrl } from '@/lib/seo';
import { webappForHost } from '@/lib/webapps';
import { webappOrigin } from '@/lib/webapp-seo';

/** Pages behind the account on every host (the site's and the web apps'). */
const ACCOUNT_PAGES = [
  '/*/admin',
  '/*/portal',
  '/*/login',
  '/*/forgot-password',
  '/*/reset-password',
];

/**
 * robots.txt of the host asking. The video chat's host lists its own sitemap and keeps its
 * account-only pages (room, contacts, settings) out; any other host gets the website's.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host');
  if (webappForHost(host) === 'videochat') {
    return {
      rules: [
        {
          userAgent: '*',
          allow: '/',
          disallow: [
            ...ACCOUNT_PAGES,
            '/*/register',
            '/*/room',
            '/*/contacts',
            '/*/settings',
            '/*/videochat/',
          ],
        },
      ],
      sitemap: `${webappOrigin('videochat')}/sitemap.xml`,
    };
  }
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ACCOUNT_PAGES }],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
