import type { ImageMetadata } from 'astro';
import type { NewsPost } from '../types';
import { ui } from './i18n';
import { escapeHtml } from './markdown';
import { imageOf, type Lang, localize, site, siteIn, translate } from './site';

export const NEWS_PATH = '/noticias';
export const NEWS_FEED_PATH = '/noticias/rss.xml';
/** Posts per list page, on the home page and in the feed. */
export const PAGE_SIZE = 10;
export const HOME_COUNT = 3;
export const FEED_COUNT = 20;

/** The published posts, newest first (the platform sends them that way; sorted here to be sure). */
export const posts: NewsPost[] = [...(site.news?.posts ?? [])].sort(
  (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
);

const englishPosts: NewsPost[] = posts.map((post) => ({
  ...post,
  title: translate(post.title, post.en?.title),
  summary: translate(post.summary, post.en?.summary),
  body: translate(post.body, post.en?.body),
}));

/** The posts in a language: their English texts where written, the Spanish ones elsewhere. */
export const postsIn = (lang: Lang): NewsPost[] => (lang === 'en' ? englishPosts : posts);

export const pageCount = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));

export const postPath = (post: NewsPost, lang: Lang = 'es') =>
  localize(`${NEWS_PATH}/${post.slug}`, lang);

/** Address of a list page: `/noticias`, `/noticias/2`… */
export const pagePath = (page: number, lang: Lang = 'es') =>
  localize(page <= 1 ? NEWS_PATH : `${NEWS_PATH}/${page}`, lang);

/** The news pages of a language: the list, its next pages and every post (none without posts). */
export function newsPaths(lang: Lang) {
  if (!posts.length) return [];
  return [
    { params: { slug: undefined }, props: { page: 1 } },
    ...Array.from({ length: pageCount - 1 }, (_, i) => ({
      params: { slug: String(i + 2) },
      props: { page: i + 2 },
    })),
    ...postsIn(lang).map((post) => ({ params: { slug: post.slug }, props: { post } })),
  ];
}

const formats: Record<Lang, Intl.DateTimeFormat> = {
  es: new Intl.DateTimeFormat(ui.es.dateLocale, { dateStyle: 'long', timeZone: 'Europe/Madrid' }),
  en: new Intl.DateTimeFormat(ui.en.dateLocale, { dateStyle: 'long', timeZone: 'Europe/Madrid' }),
};

/** "14 de noviembre de 2026", "14 November 2026" */
export const formatDate = (iso: string, lang: Lang = 'es') => formats[lang].format(new Date(iso));

/** The optimisable photo of a post, when it has one. */
export const photoOf = (post: NewsPost): ImageMetadata | undefined =>
  post.photo ? imageOf({ file: post.photo.file, alt: post.photo.alt ?? post.title }) : undefined;

/** The RSS feed of the latest posts in a language (`/noticias/rss.xml`, `/en/noticias/rss.xml`). */
export function feed(lang: Lang, origin: URL | undefined): Response {
  const at = (path: string) => new URL(path, origin).toString();
  const t = ui[lang];
  const { name } = siteIn(lang).business;
  const items = postsIn(lang)
    .slice(0, FEED_COUNT)
    .map(
      (post) => `    <item>
      <title>${escapeHtml(post.title)}</title>
      <link>${escapeHtml(at(postPath(post, lang)))}</link>
      <guid isPermaLink="true">${escapeHtml(at(postPath(post, lang)))}</guid>
      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>
      <description>${escapeHtml(post.summary)}</description>
    </item>`,
    )
    .join('\n');
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(t.newsTitle(name))}</title>
    <link>${escapeHtml(at(localize(NEWS_PATH, lang)))}</link>
    <description>${escapeHtml(t.newsDescription(name))}</description>
    <language>${t.feedLang}</language>
    <atom:link href="${escapeHtml(at(localize(NEWS_FEED_PATH, lang)))}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;
  return new Response(body, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' } });
}
