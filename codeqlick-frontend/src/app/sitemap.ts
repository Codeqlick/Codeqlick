import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { connection } from 'next/server';
import { SERVICE_SLUGS } from '@/components/content/services';
import { routing } from '@/i18n/routing';
import { listPortfolio } from '@/lib/api/portfolio';
import { listPosts } from '@/lib/api/posts';
import { getCalculator } from '@/lib/api/calculator';
import { getBookingSlots } from '@/lib/api/bookings';
import { legalOwner } from '@/lib/env';
import { absoluteUrl } from '@/lib/seo';
import { webappForHost } from '@/lib/webapps';
import { WEBAPP_PUBLIC_PATHS, webappUrl } from '@/lib/webapp-seo';

const STATIC_PATHS = [
  '',
  '/services',
  '/basic-website',
  '/basic-website/request',
  '/website-check',
  ...Object.values(SERVICE_SLUGS).map((slug) => `/services/${slug}`),
  '/work',
  '/blog',
  '/about',
  '/apps',
  '/contact',
  '/security',
  ...(legalOwner ? ['/legal', '/privacy'] : []),
];

/** Slugs of published content; an unreachable API must not break the sitemap (or the build). */
async function contentPaths(): Promise<{ path: string; lastModified?: string }[]> {
  try {
    const [posts, portfolio] = await Promise.all([
      listPosts({ locale: routing.defaultLocale, pageSize: 100 }),
      listPortfolio({ locale: routing.defaultLocale, pageSize: 100 }),
    ]);
    return [
      ...posts.items.map((post) => ({
        path: `/blog/${post.slug}`,
        lastModified: post.publishedAt,
      })),
      ...portfolio.items.map((item) => ({ path: `/work/${item.slug}` })),
    ];
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Generated per request: a build-time sitemap has no API to read the content slugs from.
  await connection();
  const app = webappForHost((await headers()).get('host'));
  const appPaths = app ? WEBAPP_PUBLIC_PATHS[app] : undefined;
  // A web app's host that is meant for search lists only its own public pages.
  if (app && appPaths) {
    return appPaths.flatMap((path) =>
      routing.locales.map((locale) => ({
        url: webappUrl(app, locale, path),
        changeFrequency: 'weekly' as const,
        priority: path === '' ? 1 : 0.5,
        alternates: {
          languages: Object.fromEntries(routing.locales.map((l) => [l, webappUrl(app, l, path)])),
        },
      })),
    );
  }
  const calculator = (await getCalculator()) ? [{ path: '/calculator' }] : [];
  const booking = (await getBookingSlots()) ? [{ path: '/book' }] : [];
  const entries = [
    ...STATIC_PATHS.map((path) => ({ path })),
    ...calculator,
    ...booking,
    ...(await contentPaths()),
  ];

  return entries.flatMap(({ path, lastModified }: { path: string; lastModified?: string }) =>
    routing.locales.map((locale) => ({
      url: absoluteUrl(`/${locale}${path}`),
      lastModified,
      alternates: {
        languages: Object.fromEntries(routing.locales.map((l) => [l, absoluteUrl(`/${l}${path}`)])),
      },
    })),
  );
}
