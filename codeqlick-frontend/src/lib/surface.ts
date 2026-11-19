import type { SurfaceChange, SurfaceScanSummary } from '@/lib/api/cloud';

/** The colour band of a grade: A+ to B good, C and D fair, anything else poor. */
export function gradeBand(grade: string | null): 'good' | 'fair' | 'poor' {
  if (grade === 'A+' || grade === 'A' || grade === 'B') return 'good';
  return grade === 'C' || grade === 'D' ? 'fair' : 'poor';
}

const BADGE_TONE = { good: 'success', fair: 'warning', poor: 'danger' } as const;

/** The badge tone of a grade. */
export function gradeBadgeTone(grade: string | null): 'success' | 'warning' | 'danger' {
  return BADGE_TONE[gradeBand(grade)];
}

/** A change written as a message key of `Cloud.surface.changes` plus what it needs. */
export type SurfaceChangeText = {
  key: 'check' | 'certExpiry' | 'certIssuer' | 'records' | 'libs';
  values: Record<string, string | number>;
  /** Added and removed items of a records or libs change, shown as lists. */
  added: string[];
  removed: string[];
  /** Values left out after the first ones shown (0 when none). */
  more: number;
};

/** Maps a change to its message and values; `titleOf` gives a check's title in the reader's language. */
export function describeSurfaceChange(
  change: SurfaceChange,
  titleOf: (id: string) => string | null,
): SurfaceChangeText {
  switch (change.kind) {
    case 'check':
      return {
        key: 'check',
        values: { title: titleOf(change.id) ?? change.id, from: change.from, to: change.to },
        added: [],
        removed: [],
        more: 0,
      };
    case 'cert_expiry':
      return {
        key: 'certExpiry',
        values: { days: change.days, threshold: change.threshold },
        added: [],
        removed: [],
        more: 0,
      };
    case 'cert_issuer':
      return {
        key: 'certIssuer',
        values: { from: change.from, to: change.to },
        added: [],
        removed: [],
        more: 0,
      };
    case 'records':
      return {
        key: 'records',
        values: { record: change.record },
        added: change.added,
        removed: change.removed,
        more: change.more ?? 0,
      };
    case 'libs':
      return {
        key: 'libs',
        values: { count: change.added.length },
        added: change.added,
        removed: [],
        more: change.more ?? 0,
      };
  }
}

/** The title of a check id in a scan's groups, or null when the scan does not have it. */
export function checkTitle(
  groups: Array<{ checks: Array<{ id: string; title: string }> }>,
  id: string,
): string | null {
  for (const group of groups) {
    const found = group.checks.find((check) => check.id === id);
    if (found) return found.title;
  }
  return null;
}

/** A scan of the history that deserves a mark: it failed or it found changes. */
export function scanMark(
  scan: Pick<SurfaceScanSummary, 'status' | 'changes'>,
): 'failed' | 'changes' | null {
  if (scan.status === 'FAILED') return 'failed';
  return scan.changes > 0 ? 'changes' : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A scan id from `?scan=`: only a UUID is passed on to the API. */
export function scanIdParam(value: string | string[] | undefined): string | null {
  const id = Array.isArray(value) ? value[0] : value;
  return id && UUID.test(id) ? id : null;
}
