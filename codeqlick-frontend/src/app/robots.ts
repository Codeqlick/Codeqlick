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
 * Menu's own routes, which are not public pages (architecture 4.20): the editor, the poster, the
 * availability list and the report form, short and with the route's name, in both languages.
 */
const MENU_APP_PAGES = [
  '/editar/',
  '/cartel/',
  '/disponibilidad/',
  '/reportar$',
  '/qr/',
  '/*/editar/',
  '/*/cartel/',
  '/*/disponibilidad/',
  '/*/reportar$',
  '/*/qr/',
  '/*/menu/',
  ...ACCOUNT_PAGES,
];

/** robots.txt: the website's, on every host; the menu host's allows only its public pages. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  if (webappForHost((await headers()).get('host')) === 'menu') {
    return {
      rules: [{ userAgent: '*', allow: '/', disallow: MENU_APP_PAGES }],
      sitemap: `${webappOrigin('menu')}/sitemap.xml`,
    };
  }
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ACCOUNT_PAGES }],
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
