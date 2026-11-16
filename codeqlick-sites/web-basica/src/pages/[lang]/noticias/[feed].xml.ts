import type { APIRoute } from 'astro';
import { feed, posts } from '../../../lib/news';
import { english } from '../../../lib/site';

/** `/en/noticias/rss.xml`: the English feed, for sites with an English version and posts. */
export function getStaticPaths() {
  return english && posts.length ? [{ params: { lang: 'en', feed: 'rss' } }] : [];
}

export const GET: APIRoute = ({ site: origin }) => feed('en', origin);
