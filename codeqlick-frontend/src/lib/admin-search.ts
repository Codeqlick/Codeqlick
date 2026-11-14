import type { AdminSearchKind } from '@/lib/api/types';

/** `q` is trimmed and 2–100 characters (architecture 4.14). */
export const ADMIN_SEARCH_MIN_LENGTH = 2;
export const ADMIN_SEARCH_MAX_LENGTH = 100;

/** How long the dialog waits after the last keystroke before searching. */
export const ADMIN_SEARCH_DEBOUNCE_MS = 200;

/** The admin page each kind opens; the API returns ids only, the website owns its routes. */
const DETAIL_PATHS: Record<AdminSearchKind, string> = {
  lead: '/admin/leads',
  user: '/admin/users',
  project: '/admin/projects',
  ticket: '/admin/support',
  proposal: '/admin/proposals',
  post: '/admin/posts',
  caseStudy: '/admin/portfolio',
};

/**
 * The locale-less link of a search result (`/admin/leads/<id>`), for the locale-aware router,
 * which adds `/<locale>`.
 */
export function adminSearchHref(kind: AdminSearchKind, id: string): string {
  return `${DETAIL_PATHS[kind]}/${encodeURIComponent(id)}`;
}

/** The trimmed query when it can be searched (2–100 characters), else null. */
export function adminSearchQuery(raw: string | null | undefined): string | null {
  const q = raw?.trim() ?? '';
  return q.length >= ADMIN_SEARCH_MIN_LENGTH && q.length <= ADMIN_SEARCH_MAX_LENGTH ? q : null;
}

/**
 * The highlighted option after moving by `delta` through `count` options, wrapping at both ends;
 * -1 when there are none. From nothing highlighted, Down goes to the first and Up to the last.
 */
export function moveActiveIndex(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}

/** Whether the shortcut is ⌘K rather than Ctrl K (Apple devices; iPadOS says "Macintosh"). */
export function isApplePlatform(userAgent: string): boolean {
  return /Mac|iPhone|iPad|iPod/.test(userAgent);
}
