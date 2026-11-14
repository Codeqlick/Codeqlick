/**
 * Revision history of posts and case studies (architecture 4.2, decision 72): helpers shared by
 * both, free of Prisma and Nest so they are easy to test.
 */

/** How many revisions are kept per post or case study. */
export const KEEP_CONTENT_REVISIONS = 20;

/** A revision as the admin API lists it (`ContentRevision`, architecture 5). */
export interface ContentRevision {
  id: string;
  /** When that version was replaced. */
  createdAt: string;
  /** Who replaced it; null once that user is deleted. */
  author: { name: string } | null;
}

export interface ContentRevisionRow {
  id: string;
  createdAt: Date;
  author: { name: string } | null;
}

export function toContentRevision(row: ContentRevisionRow): ContentRevision {
  return { id: row.id, createdAt: row.createdAt.toISOString(), author: row.author };
}

/** The API's lowercase locale for a database one (`EN` / `ES`). */
export function snapshotLocale(locale: string): 'en' | 'es' {
  return locale === 'ES' ? 'es' : 'en';
}

/**
 * The same snapshot with tag ids and translations in a fixed order and object keys sorted, so
 * two snapshots that differ only in those orders serialize the same.
 */
function canonical(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) {
    const items = value.map((item) => canonical(item));
    if (key === 'tagIds') return items.toSorted((a, b) => String(a).localeCompare(String(b)));
    if (key === 'translations') {
      const locale = (item: unknown) => String((item as { locale?: unknown }).locale);
      return items.toSorted((a, b) => locale(a).localeCompare(locale(b)));
    }
    return items;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .toSorted(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([name, item]) => [name, canonical(item, name)]));
  }
  return value;
}

/** Whether two snapshots hold the same content (tag ids and translations in any order). */
export function sameSnapshot(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/**
 * Ids of the revisions beyond the `keep` newest, given ids newest first: those to delete after
 * adding one.
 */
export function revisionsToPrune(newestFirst: { id: string }[], keep = KEEP_CONTENT_REVISIONS) {
  return newestFirst.slice(keep).map((row) => row.id);
}
