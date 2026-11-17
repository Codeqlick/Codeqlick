import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { routing } from '@/i18n/routing';
import { NEOQLICK_APP_ICONS } from '@/lib/brand';
import { classifyHost } from '@/lib/hosts';
import { SITE_NAME, TAGLINE } from '@/lib/site';
import { webappForHost } from '@/lib/webapps';

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

/**
 * The installable app's description. On the video chat's host it is the video chat (installs as
 * its own app on phones; architecture 4.7), on Swipe's host Swipe (4.10), on Cruising's host
 * Cruising (4.15, decision 96), anywhere else the website.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const incoming = await headers();
  const host = incoming.get('x-forwarded-host')?.split(',')[0]?.trim() || incoming.get('host');
  const app = webappForHost(host);
  // The 18+ apps are Neoqlick's (architecture 4.18): its violet, its mark on night, no Codeqlick.
  const icons = [...NEOQLICK_APP_ICONS];
  if (app === 'videochat') {
    return {
      id: '/videochat',
      name: 'Neoqlick Videochat',
      short_name: 'Videochat',
      description: 'Random 1:1 video chat for adults.',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#ffffff',
      theme_color: '#7c3aed',
      icons,
    };
  }
  if (app === 'cruising') {
    // Cruising (decision 96): opens the map full screen.
    return {
      id: '/cruising',
      name: 'Cruising',
      short_name: 'Cruising',
      description: 'Cruising spots on a map, for adults (18+).',
      start_url: '/map',
      scope: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#7c3aed',
      icons,
    };
  }
  if (app === 'swipe') {
    return {
      id: '/swipe',
      name: 'Swipe',
      short_name: 'Swipe',
      description: 'Swipe (18+).',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#ffffff',
      theme_color: '#7c3aed',
      icons,
    };
  }
  // Neoqlick's portal and account host: its own name, never the website's.
  if (classifyHost(host).brand === 'neoqlick') {
    return {
      name: 'Neoqlick',
      short_name: 'Neoqlick',
      description: 'Apps for adults (18+).',
      start_url: `/${routing.defaultLocale}`,
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#7c3aed',
      icons,
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
