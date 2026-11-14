import { Locale } from '../../generated/prisma/client.js';

/**
 * Internal links (architecture 4.6, Broken links): a link on the website itself is checked against
 * the database and the website's own routes, never fetched. The routes below mirror the website's
 * public pages (`codeqlick-frontend/src/app`): keep them in step when a public page is added.
 */

const LOCALES: ReadonlyMap<string, Locale> = new Map([
  ['en', Locale.EN],
  ['es', Locale.ES],
]);

/** Public pages under a locale (`/en…`, `/es…`), without it. */
export const LOCALIZED_PAGES: ReadonlySet<string> = new Set([
  '',
  '/about',
  '/apps',
  '/basic-website',
  '/basic-website/request',
  '/blog',
  '/blog/feed.xml',
  '/book',
  '/calculator',
  '/citas',
  '/cloud',
  '/cloud/cli',
  '/cloud/docs',
  '/cloud/report',
  '/cloud/terms-of-use',
  '/contact',
  '/forgot-password',
  '/legal',
  '/login',
  '/meetings',
  '/portal',
  '/privacy',
  '/register',
  '/security',
  '/services',
  ...[
    'web-applications',
    'custom-software',
    'mobile-and-pwa',
    'ui-ux-design',
    'technical-consulting',
    'maintenance-and-support',
  ].map((slug) => `/services/${slug}`),
  '/swipe',
  '/swipe/privacy-policy',
  '/swipe/rules',
  '/swipe/takedown',
  '/swipe/terms-of-use',
  '/terms',
  '/videochat',
  '/videochat/rules',
  '/website-check',
  '/work',
]);

/** Files and routes outside the locales. */
export const UNLOCALIZED_PAGES: ReadonlySet<string> = new Set([
  '/.well-known/security.txt',
  '/apple-touch-icon.png',
  '/favicon.ico',
  '/favicon.svg',
  '/manifest.webmanifest',
  '/og-image.png',
  '/robots.txt',
  '/sitemap.xml',
]);

/**
 * Public pages with a parameter the check can't look up (booking pages, status pages, meeting
 * rooms, website check reports, site previews), and areas behind a login: a link under them counts
 * as unknown, never as broken. Under a locale or not.
 */
export const DYNAMIC_PREFIXES: readonly string[] = [
  '/admin/',
  '/basic-website/request/preview/',
  '/citas/',
  '/cloud/console/',
  '/cloud/status/',
  '/meetings/',
  '/portal/',
  '/swipe/matches/',
  '/videochat/',
  '/website-check/',
];

/** Routes outside the locales with a parameter (avatars, site drafts, the analytics proxy). */
const UNLOCALIZED_DYNAMIC_PREFIXES: readonly string[] = ['/api/', '/avatar/', '/site-draft/'];

/** Names the API gives uploaded images (`/media/<file>`, served by the website). */
const MEDIA_FILE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(?:png|jpg|webp|gif)$/;

export type InternalTarget =
  | { kind: 'post'; slug: string; locale: Locale }
  | { kind: 'portfolio'; slug: string; locale: Locale }
  | { kind: 'media'; filename: string }
  | { kind: 'page'; exists: boolean }
  /** Can't be told without fetching it: a dynamic page or a file of the website's `public/`. */
  | { kind: 'unknown' };

/**
 * What an internal link points at. A path without a locale gets the locale of the translation it
 * appears in (the website sends a visitor to a locale; the writer meant their own language).
 */
export function internalTarget(url: URL, fallbackLocale: Locale): InternalTarget {
  const path = url.pathname.replace(/\/+$/, '');
  if (UNLOCALIZED_PAGES.has(path)) return { kind: 'page', exists: true };
  const media = /^\/media\/([^/]+)$/.exec(path);
  if (media) {
    return MEDIA_FILE.test(media[1]!)
      ? { kind: 'media', filename: media[1]! }
      : { kind: 'page', exists: false };
  }

  const segments = path.split('/').filter((segment) => segment.length > 0);
  const prefixed = segments[0] !== undefined ? LOCALES.get(segments[0]) : undefined;
  const locale = prefixed ?? fallbackLocale;
  const rest = prefixed ? segments.slice(1) : segments;
  const page = rest.length > 0 ? `/${rest.join('/')}` : '';

  if (LOCALIZED_PAGES.has(page)) return { kind: 'page', exists: true };
  // A file (`/demos/…/logo.png`, `/presets/…`): the website's `public/` folder isn't known here.
  // Slugs never have a dot, so no post or case study is mistaken for one.
  if (/\.[A-Za-z0-9]{1,8}$/.test(segments.at(-1) ?? '')) return { kind: 'unknown' };
  if (rest.length === 2 && rest[0] === 'blog') return { kind: 'post', slug: rest[1]!, locale };
  if (rest.length === 2 && rest[0] === 'work') return { kind: 'portfolio', slug: rest[1]!, locale };
  const under = (prefix: string, value: string) => `${value}/`.startsWith(prefix);
  if (UNLOCALIZED_DYNAMIC_PREFIXES.some((prefix) => under(prefix, path)))
    return { kind: 'unknown' };
  if (DYNAMIC_PREFIXES.some((prefix) => under(prefix, page))) return { kind: 'unknown' };
  return { kind: 'page', exists: false };
}

/** Live posts' and case studies' slugs, each with the languages it has. */
export interface LiveIndex {
  posts: ReadonlyMap<string, ReadonlySet<Locale>>;
  portfolio: ReadonlyMap<string, ReadonlySet<Locale>>;
}

export function buildLiveIndex(
  items: readonly { type: 'POST' | 'PORTFOLIO'; slug: string; locales: readonly Locale[] }[],
): LiveIndex {
  const posts = new Map<string, Set<Locale>>();
  const portfolio = new Map<string, Set<Locale>>();
  for (const item of items) {
    (item.type === 'POST' ? posts : portfolio).set(item.slug, new Set(item.locales));
  }
  return { posts, portfolio };
}

/**
 * Whether an internal link works (null: can't be told). A post or case study must be published
 * (live) with at least one translation (the website shows the link's language, or falls back to
 * English, then to whatever exists, as the API's `pickTranslation` does: only a missing or
 * unpublished item is a 404); an uploaded image must exist; any other path must be one of the
 * site's pages, a dynamic page or a file (both unknown).
 */
export async function internalLinkExists(
  url: string,
  locale: Locale,
  index: LiveIndex,
  mediaExists: (filename: string) => Promise<boolean>,
): Promise<boolean | null> {
  const target = internalTarget(new URL(url), locale);
  switch (target.kind) {
    case 'post':
      return (index.posts.get(target.slug)?.size ?? 0) > 0;
    case 'portfolio':
      return (index.portfolio.get(target.slug)?.size ?? 0) > 0;
    case 'media':
      return mediaExists(target.filename);
    case 'page':
      return target.exists;
    case 'unknown':
      return null;
  }
}
