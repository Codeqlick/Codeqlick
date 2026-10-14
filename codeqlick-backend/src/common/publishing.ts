import { PublishStatus } from '../generated/prisma/client.js';

/**
 * Content (posts, case studies) is live when it is PUBLISHED and its publication date has come.
 * A PUBLISHED item dated in the future is scheduled: the public API hides it until then, so it
 * appears on its own, with no job to run (public pages refresh every 5 minutes).
 */
export function liveWhere(now = new Date()) {
  return { status: PublishStatus.PUBLISHED, publishedAt: { lte: now } };
}

export function isScheduled(
  item: { status: PublishStatus; publishedAt: Date | null },
  now = new Date(),
): boolean {
  return (
    item.status === PublishStatus.PUBLISHED && item.publishedAt !== null && item.publishedAt > now
  );
}

/**
 * Publication date to store on create. A requested date wins (future: scheduled; past:
 * backdated); a published item without one is published now; a draft without one has none.
 */
export function publishedAtOnCreate(
  status: PublishStatus,
  requested: string | null | undefined,
): Date | null {
  if (requested) return new Date(requested);
  return status === PublishStatus.PUBLISHED ? new Date() : null;
}

/**
 * Publication date to store on update, or undefined to leave it as it is. Clearing the date of a
 * published item means "now"; the date is otherwise set the first time an item is published.
 */
export function publishedAtOnUpdate(
  existing: { status: PublishStatus; publishedAt: Date | null },
  status: PublishStatus | undefined,
  requested: string | null | undefined,
): Date | null | undefined {
  const nextStatus = status ?? existing.status;
  if (requested !== undefined) {
    if (requested) return new Date(requested);
    return nextStatus === PublishStatus.PUBLISHED ? new Date() : null;
  }
  if (nextStatus === PublishStatus.PUBLISHED && !existing.publishedAt) return new Date();
  return undefined;
}
