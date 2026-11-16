import type { APIRoute } from 'astro';
import { feed, posts } from '../../lib/news';

/** `/noticias/rss.xml`: the latest posts as an RSS feed; built only with published posts. */
export function getStaticPaths() {
  return posts.length ? [{ params: { feed: 'rss' } }] : [];
}

export const GET: APIRoute = ({ site: origin }) => feed('es', origin);
