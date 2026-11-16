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

/** Account-only pages of each web app whose host is meant for search. */
const APP_PRIVATE_PAGES = {
  videochat: ['/*/room', '/*/contacts', '/*/settings', '/*/videochat/'],
  swipe: ['/*/deck', '/*/photos', '/*/matches', '/*/img/', '/*/swipe/'],
  // The map's data route is for the page, not for crawlers.
  cruising: [
    '/*/new',
    '/*/my-spots',
    '/*/me',
    '/*/members',
    '/*/messages',
    '/*/api/',
    '/*/media/',
    '/*/cruising/',
  ],
} as const;

/**
 * robots.txt of the host asking. The video chat's, Swipe's and Cruising's hosts list their own
 * sitemap and keep their account-only pages out; any other host gets the website's.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get('host');
  const app = webappForHost(host);
  if (app === 'videochat' || app === 'swipe' || app === 'cruising') {
    return {
      rules: [
        {
          userAgent: '*',
          allow: '/',
          disallow: [...ACCOUNT_PAGES, '/*/register', ...APP_PRIVATE_PAGES[app]],
        },
      ],
      sitemap: `${webappOrigin(app)}/sitemap.xml`,
    };
  }
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ACCOUNT_PAGES }],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
