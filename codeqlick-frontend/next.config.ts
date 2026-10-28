import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/**
 * Production only: `next dev` needs eval and a websocket for hot reload. Next.js inlines its
 * bootstrap scripts, so scripts need 'unsafe-inline' (a nonce would make every page dynamic); the
 * policy still blocks scripts, styles, fonts and connections from any other origin. Images may be
 * remote because Markdown content can reference them.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');

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
        // same-origin frame rule would keep them out of the editor's iframe.
        source: '/:path((?!site-draft/).*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          ...productionHeaders,
        ],
      },
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
