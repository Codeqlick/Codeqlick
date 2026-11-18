import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { SITE_NAME, TAGLINE } from '@/lib/site';

/**
 * `any`: the rounded logo, for places that show the icon as is. `maskable`: full-bleed fuchsia with
 * the logo inside the safe zone, so Android crops it to its own shape (circle, squircle…) without
 * a light or dark plate around it.
 */
const ICONS: MetadataRoute.Manifest['icons'] = [
  { src: '/favicon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];

/** The installable app's description: the website's. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: TAGLINE,
    start_url: `/${routing.defaultLocale}`,
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#d9177e',
    icons: ICONS,
  };
}
