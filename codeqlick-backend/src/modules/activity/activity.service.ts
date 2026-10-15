import { Injectable, Logger } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import type { ActivityLog, Prisma } from '../../generated/prisma/client.js';
import { ActivityRepository } from './activity.repository.js';
import type { ActivityAction, ListActivityQuery } from './activity.schemas.js';

export interface ActivityEntry {
  id: string;
  action: string;
  /** `id` is null once the user has been deleted; `name` is the name they had at the time. */
  actor: { id: string | null; name: string };
  target: { type: string; id: string | null; label: string | null };
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface ActivityRecord {
  action: ActivityAction;
  targetId?: string | null;
  /** Human-readable name of the target at the time (title, name, email, file name). */
  targetLabel?: string | null;
  details?: Record<string, unknown>;
}

/** Log label for translated content (posts, case studies): the Spanish title when there is one. */
export function contentLabel(item: {
  slug: string;
  translations: { locale: string; title: string }[];
}): string {
  return (
    (item.translations.find((t) => t.locale === 'es') ?? item.translations[0])?.title ?? item.slug
  );
}

interface Publishable {
  status: string;
  publishedAt: Date | string | null;
}

function isFuture(item: Publishable, now: Date): boolean {
  return item.status === 'PUBLISHED' && !!item.publishedAt && new Date(item.publishedAt) > now;
}

/** `{ publishedAt }` for an item scheduled in the future, to show when it goes live. */
export function scheduledDetails(item: Publishable, now = new Date()): { publishedAt?: string } {
  return isFuture(item, now)
    ? { publishedAt: new Date(item.publishedAt as string).toISOString() }
    : {};
}

/**
 * Verb for an update of a post or case study: `scheduled` when it now waits for a future date
 * (newly published or re-dated), `published` / `unpublished` for status changes, else `updated`.
 */
export function publishVerb(
  before: Publishable,
  after: Publishable,
  input: { status?: string; publishedAt?: string | null },
  now = new Date(),
): 'published' | 'unpublished' | 'scheduled' | 'updated' {
  const statusChanged = input.status !== undefined && input.status !== before.status;
  const dateChanged =
    input.publishedAt !== undefined &&
    new Date(after.publishedAt ?? 0).getTime() !== new Date(before.publishedAt ?? 0).getTime();
  if (isFuture(after, now) && (statusChanged || dateChanged)) return 'scheduled';
  if (!statusChanged) return 'updated';
  if (after.status === 'PUBLISHED') return 'published';
  return before.status === 'PUBLISHED' ? 'unpublished' : 'updated';
}

function toEntry(row: ActivityLog): ActivityEntry {
  return {
    id: row.id,
    action: row.action,
    actor: { id: row.actorId, name: row.actorName },
    target: { type: row.targetType, id: row.targetId, label: row.targetLabel },
    details: (row.details as Record<string, unknown> | null) ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The activity log: who changed what, written by the services that make the changes. */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly repository: ActivityRepository) {}

  /**
   * Records a change that has already happened. Never throws: losing a log line must not turn a
   * successful change into an error for the user.
   */
  async record(actor: AuthUser, entry: ActivityRecord): Promise<void> {
    try {
      await this.repository.create({
        actorId: actor.id,
        actorName: actor.name || actor.email,
        action: entry.action,
        targetType: entry.action.split('.')[0] ?? entry.action,
        targetId: entry.targetId ?? null,
        targetLabel: entry.targetLabel?.slice(0, 300) ?? null,
        details: (entry.details as Prisma.InputJsonValue | undefined) ?? undefined,
      });
    } catch (error) {
      this.logger.error(
        `Could not record ${entry.action}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  async list(query: ListActivityQuery): Promise<Paginated<ActivityEntry>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const { items, total } = await this.repository.list(query.targetType, skip, take);
    return paginate(items.map(toEntry), total, query.page, query.pageSize);
  }
}
