import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { SERVICE_SLUGS } from '@/components/content/services';
import { routing } from '@/i18n/routing';
import { listPortfolio } from '@/lib/api/portfolio';
import { listPosts } from '@/lib/api/posts';
import { legalOwner } from '@/lib/env';
import { absoluteUrl } from '@/lib/seo';

const STATIC_PATHS = [
  '',
  '/services',
  ...Object.values(SERVICE_SLUGS).map((slug) => `/services/${slug}`),
  '/work',
  '/blog',
  '/about',
  '/contact',
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
  const entries = [...STATIC_PATHS.map((path) => ({ path })), ...(await contentPaths())];

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
