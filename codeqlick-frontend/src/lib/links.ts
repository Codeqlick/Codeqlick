import type { LinkCheck, LinkSource } from '@/lib/api/types';

/** Admin → Broken links: pure helpers for its table (architecture 4.6). */

export type LinkFilter = 'broken' | 'all';

/** `?status=all` shows every checked link; anything else, the broken ones (the API's default). */
export function parseLinkFilter(value: string | undefined): LinkFilter {
  return value === 'all' ? 'all' : 'broken';
}

/** What the last check got: the HTTP code (`HTTP 404`), else the network error, else nothing. */
export function linkResultLabel(link: Pick<LinkCheck, 'statusCode' | 'error'>): string | null {
  if (link.statusCode !== null) return `HTTP ${link.statusCode}`;
  const error = link.error?.trim();
  return error ? error : null;
}

/** The admin page that edits the post or case study the link was found in. */
export function linkSourceEditHref(source: Pick<LinkSource, 'type' | 'id'>): string {
  const base = source.type === 'POST' ? '/admin/posts' : '/admin/portfolio';
  return `${base}/${encodeURIComponent(source.id)}`;
}

/** The URL without its scheme or a lone trailing slash, for a narrow column (`example.com/a`). */
export function displayLinkUrl(url: string): string {
  const withoutScheme = url.replace(/^https?:\/\//i, '');
  return /^[^/?#]+\/$/.test(withoutScheme) ? withoutScheme.slice(0, -1) : withoutScheme;
}

/** Only `http(s)` addresses become clickable links; anything else is shown as plain text. */
export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}
