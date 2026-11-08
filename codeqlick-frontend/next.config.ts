import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { EXOCLICK_HOSTS } from './src/lib/videochat-ads';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Production only: `next dev` needs eval and a websocket for hot reload. Next.js inlines its
 * bootstrap scripts, so scripts need 'unsafe-inline' (a nonce would make every page dynamic); the
 * policy still blocks scripts, styles, fonts and connections from any other origin. Images may be
 * remote because Markdown content can reference them.
 */
/**
 * The web apps' WebSockets when they aren't on the page's own host (VIDEOCHAT_WS_URL and
 * MEETINGS_WS_URL, read at build time; in production they are wss://<host>/ws, which 'self'
 * covers).
 */
const appSockets = [process.env.VIDEOCHAT_WS_URL, process.env.MEETINGS_WS_URL]
  .map((url) => {
    try {
      return url ? new URL(url).origin : '';
    } catch {
      return '';
    }
  })
  .filter((origin, index, all) => origin && all.indexOf(origin) === index);

/** `extra` adds third-party hosts to scripts, frames and connections (the video chat's ads). */
const policy = (extra: string[] = []) =>
  [
    "default-src 'self'",
    ['script-src', "'self'", "'unsafe-inline'", ...extra].join(' '),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    ['connect-src', "'self'", ...appSockets, ...extra].join(' '),
    ...(extra.length ? [['frame-src', "'self'", ...extra].join(' ')] : []),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join('; ');

const contentSecurityPolicy = policy();
/** The video chat's host also loads ExoClick's ad zones (architecture 4.7); no other host does. */
const videochatSecurityPolicy = policy(EXOCLICK_HOSTS);

/** Hosts of the web apps that make calls: videochat.codeqlick.com, meetings.localhost… (6.3). */
const CALL_HOSTS = '(videochat|meetings)\\..+';

const productionHeaders =
  process.env.NODE_ENV === 'production'
    ? [
        { key: 'Content-Security-Policy', value: contentSecurityPolicy },
        // Browsers ignore it over plain HTTP, so local production builds are unaffected.
        { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
      ]
    : [];

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  images: {
    // Only uploads from the admin panel (served by app/media) are resized and re-encoded.
    localPatterns: [
      { pathname: '/media/**', search: '' },
      { pathname: '/demos/**', search: '' },
    ],
    formats: ['image/webp'],
  },
  experimental: {
    // The site's CSS is small (~12 KB): inlined in the HTML, no stylesheet blocks the first paint.
    inlineCss: true,
    // Image uploads from the admin panel go through a Server Action (API limit: 5 MB).
    serverActions: { bodySizeLimit: '6mb' },
    // The proxy buffers request bodies up to this size and cuts the rest: project file uploads
    // pass through it (API limit: 25 MB, plus the multipart overhead).
    proxyClientMaxBodySize: '26mb',
  },
  async headers() {
    return [
      {
        // Not the drafts' previews (/site-draft): sandboxed, their origin is opaque, and a
        // same-origin frame rule would keep them out of the editor's iframe. Not the hosts of the
        // apps that make calls either: they get the same headers below, with the camera, the
        // microphone and screen sharing allowed.
        source: '/:path((?!site-draft/).*)',
        missing: [{ type: 'host', value: CALL_HOSTS }],
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          ...productionHeaders,
        ],
      },
      {
        // Every page of a calling app's host may use the camera: navigating inside the app keeps
        // the policy of the first page loaded (the landing or the sign-in), not the room's.
        source: '/:path((?!site-draft/).*)',
        has: [{ type: 'host', value: CALL_HOSTS }],
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), display-capture=(self), geolocation=()',
          },
          ...productionHeaders,
        ],
      },
      ...(process.env.NODE_ENV === 'production'
        ? [
            {
              // Last match wins: the video chat's host swaps in the policy that allows its ads.
              source: '/:path((?!site-draft/).*)',
              has: [{ type: 'host' as const, value: 'videochat\\..+' }],
              headers: [{ key: 'Content-Security-Policy', value: videochatSecurityPolicy }],
            },
          ]
        : []),
      {
        source: '/site-draft/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
