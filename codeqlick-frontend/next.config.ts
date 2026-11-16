import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { CALL_APPS, LOCATING_APPS, securityHeaders } from './src/lib/security-headers';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const production = process.env.NODE_ENV === 'production';

/**
 * Every path but the drafts' previews (/site-draft): sandboxed, their origin is opaque and they
 * keep their own headers. The Content Security Policy is the proxy's (it needs a nonce per
 * response, architecture 6.4); these are the rest, the same on every host but the
 * Permissions-Policy of the apps that make calls or locate the device.
 */
const PAGES = '/:path((?!site-draft/).*)';
/** Apps whose host gets its own Permissions-Policy: videochat.codeqlick.com, cruising.localhost… */
const OWN_POLICY_APPS = [...CALL_APPS, ...LOCATING_APPS];
const appHost = (app: string) => `${app}\\..+`;

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  // The proxy sees the request's own address, so its rewrites to an app's route (src/proxy.ts) stay
  // on this server; otherwise Next.js names it localhost, takes the rewrite for another server's
  // and fetches it over HTTP, losing the visitor's host.
  skipProxyUrlNormalize: true,
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
        source: PAGES,
        missing: OWN_POLICY_APPS.map((app) => ({ type: 'host' as const, value: appHost(app) })),
        headers: securityHeaders(null, production),
      },
      // Every page of a calling app's host may use the camera (navigating inside the app keeps the
      // policy of the first page loaded), and only Cruising's may locate the device.
      ...OWN_POLICY_APPS.map((app) => ({
        source: PAGES,
        has: [{ type: 'host' as const, value: appHost(app) }],
        headers: securityHeaders(app, production),
      })),
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
