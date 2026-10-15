import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { listPosts, PUBLIC_REVALIDATE } from '@/lib/api/posts';
import { absoluteUrl } from '@/lib/seo';
import { SITE_NAME } from '@/lib/site';

const FEED_SIZE = 20;

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** RSS 2.0 feed of the latest posts in one language: /en/blog/feed.xml, /es/blog/feed.xml. */
export async function GET(_request: Request, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return new Response('Not found', { status: 404 });

  const t = await getTranslations({ locale, namespace: 'Blog' });
  let posts;
  try {
    posts = (await listPosts({ locale, pageSize: FEED_SIZE })).items;
  } catch {
    // An empty feed would tell readers every post was removed; an error makes them retry later.
    return new Response('Feed temporarily unavailable', { status: 503 });
  }

  const feedUrl = absoluteUrl(`/${locale}/blog/feed.xml`);
  const items = posts
    .map((post) => {
      const url = absoluteUrl(`/${locale}/blog/${post.slug}`);
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
      <description>${escapeXml(post.excerpt)}</description>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${SITE_NAME} — ${t('metaTitle')}`)}</title>
    <link>${escapeXml(absoluteUrl(`/${locale}/blog`))}</link>
    <description>${escapeXml(t('metaDescription'))}</description>
    <language>${locale}</language>
    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': `public, max-age=${PUBLIC_REVALIDATE}`,
    },
  });
}
