import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/seo';

/** Pages behind the account on every host (the site's and the web apps'). */
const ACCOUNT_PAGES = [
  '/*/admin',
  '/*/portal',
  '/*/login',
  '/*/forgot-password',
  '/*/reset-password',
];

/** robots.txt: the website's, on every host. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ACCOUNT_PAGES }],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
