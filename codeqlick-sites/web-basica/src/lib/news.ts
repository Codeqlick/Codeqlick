import type { ImageMetadata } from 'astro';
import type { NewsPost } from '../types';
import { imageOf, site } from './site';

export const NEWS_PATH = '/noticias';
export const NEWS_FEED_PATH = '/noticias/rss.xml';
/** Posts per list page, on the home page and in the feed. */
export const PAGE_SIZE = 10;
export const HOME_COUNT = 3;
export const FEED_COUNT = 20;

/** The published posts, newest first (the platform sends them that way; sorted here to be sure). */
export const posts: NewsPost[] = [...(site.news?.posts ?? [])].sort((a, b) =>
  b.publishedAt.localeCompare(a.publishedAt),
);

export const pageCount = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));

export const postPath = (post: NewsPost) => `${NEWS_PATH}/${post.slug}`;

/** Address of a list page: `/noticias`, `/noticias/2`… */
export const pagePath = (page: number) => (page <= 1 ? NEWS_PATH : `${NEWS_PATH}/${page}`);

const dateFormat = new Intl.DateTimeFormat('es-ES', {
  dateStyle: 'long',
  timeZone: 'Europe/Madrid',
});

/** "14 de noviembre de 2026" */
export const formatDate = (iso: string) => dateFormat.format(new Date(iso));

/** The optimisable photo of a post, when it has one. */
export const photoOf = (post: NewsPost): ImageMetadata | undefined =>
  post.photo ? imageOf({ file: post.photo.file, alt: post.photo.alt ?? post.title }) : undefined;
