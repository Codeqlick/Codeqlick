import { WEBAPPS } from './webapps.js';

/**
 * Words a public link on one of Codeqlick's web apps (`citas.codeqlick.com/es/<slug>`,
 * `menu.codeqlick.com/<slug>`) can't take: the sign-in pages the hosts also serve, the web apps and
 * the main site's sections. Citas and Menu share this list; each adds its own routes.
 */
export const COMMON_RESERVED_SLUGS: readonly string[] = [
  'login',
  'register',
  'forgot-password',
  'reset-password',
  // Single sign-on's callback (decision 108) and the account host's name.
  'auth',
  'account',
  // The main site's sections: the frontend's `SITE_SECTIONS`.
  ...WEBAPPS,
  'about',
  'admin',
  'apps',
  'basic-website',
  'blog',
  'book',
  'calculator',
  'confirm-email',
  'contact',
  'email',
  'legal',
  'portal',
  'privacy',
  'safety-contact',
  'services',
  'terms',
  'work',
  // Brand and system words.
  'api',
  'www',
];
