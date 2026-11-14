import type { APIRoute } from 'astro';
import { escapeHtml } from '../../lib/markdown';
import { FEED_COUNT, NEWS_FEED_PATH, NEWS_PATH, postPath, posts } from '../../lib/news';
import { site } from '../../lib/site';

/** `/noticias/rss.xml`: the latest posts as an RSS feed; built only with published posts. */
export function getStaticPaths() {
  return posts.length ? [{ params: { feed: 'rss' } }] : [];
}

export const GET: APIRoute = ({ site: origin }) => {
  const at = (path: string) => new URL(path, origin).toString();
  const items = posts
    .slice(0, FEED_COUNT)
    .map(
      (post) => `    <item>
      <title>${escapeHtml(post.title)}</title>
      <link>${escapeHtml(at(postPath(post)))}</link>
      <guid isPermaLink="true">${escapeHtml(at(postPath(post)))}</guid>
      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
      <description>${escapeHtml(post.summary)}</description>
    </item>`,
    )
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(`Noticias de ${site.business.name}`)}</title>
    <link>${escapeHtml(at(NEWS_PATH))}</link>
    <description>${escapeHtml(`Novedades y ofertas de ${site.business.name}.`)}</description>
    <language>es-ES</language>
    <atom:link href="${escapeHtml(at(NEWS_FEED_PATH))}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
};
