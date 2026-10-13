import type { MetadataRoute } from 'next';
import { routing } from '@/i18n/routing';
import { listPortfolio } from '@/lib/api/portfolio';
import { listPosts } from '@/lib/api/posts';
import { absoluteUrl } from '@/lib/seo';

const STATIC_PATHS = ['', '/work', '/blog', '/contact'];

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
