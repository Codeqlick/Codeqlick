/**
 * Moving a project to another team (architecture 4.13 "Moving a project to another team",
 * decision 58): the rules that need no database.
 */

/** What happened to the project's Git link. */
export type GitOutcome = 'kept' | 'dropped' | 'none';

/** Analytics events rewritten per statement after the move (older than the month). */
export const ANALYTICS_BATCH = 10_000;

/**
 * A people list (form recipients, email channel recipients, monitor alerts) after the move: only
 * the target team's members stay; a list left empty becomes the person who moved the project.
 */
export function keepMembers(ids: string[], members: ReadonlySet<string>, mover: string): string[] {
  const kept = ids.filter((id) => members.has(id));
  return kept.length > 0 ? kept : [mover];
}

export function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}

/** A status page's `items` (`[{ monitorId, label }]`) without the moved monitors; null if none was there. */
export function withoutMonitors(items: unknown, monitorIds: ReadonlySet<string>): unknown[] | null {
  if (!Array.isArray(items)) return null;
  const kept = items.filter(
    (item) =>
      !(
        item &&
        typeof item === 'object' &&
        typeof (item as { monitorId?: unknown }).monitorId === 'string' &&
        monitorIds.has((item as { monitorId: string }).monitorId)
      ),
  );
  return kept.length === items.length ? null : kept;
}

/** Megabytes for the storage refusal: what's left rounded down, what's needed rounded up. */
export function megabytes(bytes: number, round: 'down' | 'up'): number {
  const mb = Math.max(0, bytes) / 1024 / 1024;
  return round === 'down' ? Math.floor(mb) : Math.ceil(mb);
}
