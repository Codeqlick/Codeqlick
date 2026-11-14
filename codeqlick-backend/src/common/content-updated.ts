import { PublishStatus, type Locale } from '../generated/prisma/client.js';

/** A translation's text as readers see it: posts have an excerpt, case studies a summary. */
export interface ReaderTranslation {
  locale: Locale;
  title: string;
  content: string;
  excerpt?: string;
  summary?: string;
}

/** What readers see of a post or case study, as far as its "Updated on" date is concerned. */
export interface ReaderContent {
  coverImageUrl: string | null;
  translations: readonly ReaderTranslation[];
}

/** A fix within this long of publication is not an update (architecture 4.2). */
export const CONTENT_UPDATE_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * Whether the readers' content differs: the cover image, a translation added or removed (by
 * locale), or a translation's title, excerpt / summary or body. Nothing else counts.
 */
export function readerContentChanged(before: ReaderContent, after: ReaderContent): boolean {
  if (before.coverImageUrl !== after.coverImageUrl) return true;
  if (before.translations.length !== after.translations.length) return true;
  const previous = new Map(before.translations.map((t) => [t.locale, t]));
  return after.translations.some((t) => {
    const old = previous.get(t.locale);
    return (
      !old ||
      old.title !== t.title ||
      (old.excerpt ?? null) !== (t.excerpt ?? null) ||
      (old.summary ?? null) !== (t.summary ?? null) ||
      old.content !== t.content
    );
  });
}

/**
 * `contentUpdatedAt` to store on a save, or undefined to leave it as it is: `now` when the item
 * was live before the save (published, dated in the past), is still published after it, and the
 * readers' content changed.
 */
export function contentUpdatedAtOnUpdate(
  existing: ReaderContent & { status: PublishStatus; publishedAt: Date | null },
  next: ReaderContent & { status: PublishStatus },
  now = new Date(),
): Date | undefined {
  const wasLive =
    existing.status === PublishStatus.PUBLISHED &&
    existing.publishedAt !== null &&
    existing.publishedAt <= now;
  if (!wasLive || next.status !== PublishStatus.PUBLISHED) return undefined;
  return readerContentChanged(existing, next) ? now : undefined;
}

/**
 * The public `contentUpdatedAt`: given only when it is at least 24 hours after the publication
 * date (`publishedAt`, or `createdAt` without one), otherwise null.
 */
export function publicContentUpdatedAt(item: {
  publishedAt: Date | null;
  createdAt: Date;
  contentUpdatedAt: Date | null;
}): string | null {
  if (!item.contentUpdatedAt) return null;
  const published = item.publishedAt ?? item.createdAt;
  return item.contentUpdatedAt.getTime() - published.getTime() >= CONTENT_UPDATE_GRACE_MS
    ? item.contentUpdatedAt.toISOString()
    : null;
}
