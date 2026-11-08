import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { routing } from '@/i18n/routing';
import { SITE_NAME, TAGLINE } from '@/lib/site';
import { webappForHost } from '@/lib/webapps';

const ICONS: MetadataRoute.Manifest['icons'] = [
  { src: '/favicon-192.png', sizes: '192x192', type: 'image/png' },
  { src: '/favicon-512.png', sizes: '512x512', type: 'image/png' },
];

/**
 * The installable app's description. On the video chat's host it is the video chat (installs as
 * its own app on phones; architecture 4.7), on Swipe's host Swipe (4.10), anywhere else the website.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const host = (await headers()).get('host');
  if (webappForHost(host) === 'videochat') {
    return {
      id: '/videochat',
      name: `${SITE_NAME} Videochat`,
      short_name: 'Videochat',
      description: 'Random 1:1 video chat for adults.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#f8f6f9',
      theme_color: '#ffffff',
      icons: ICONS,
    };
  }
  if (webappForHost(host) === 'swipe') {
    // Swipe carries no Codeqlick name or logo (architecture 4.10).
    return {
      id: '/swipe',
      name: 'Swipe',
      short_name: 'Swipe',
      description: 'Swipe (18+).',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#f8f6f9',
      theme_color: '#ffffff',
      icons: [
        { src: '/swipe-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/swipe-512.png', sizes: '512x512', type: 'image/png' },
      ],
    };
  }
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
