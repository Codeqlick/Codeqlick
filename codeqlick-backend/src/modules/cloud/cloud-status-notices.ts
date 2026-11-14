import type { MonitorState, StateChange } from './cloud-uptime.js';

/** Notices on a status page: incidents and scheduled maintenance (architecture 4.13). Pure. */

export type NoticeKind = 'INCIDENT' | 'MAINTENANCE';

export type NoticeState =
  | 'INVESTIGATING'
  | 'IDENTIFIED'
  | 'MONITORING'
  | 'RESOLVED'
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'COMPLETED';

export const INCIDENT_STATES = ['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'] as const;

/** What the rules below read from a notice. */
export interface NoticeTiming {
  kind: NoticeKind;
  state: NoticeState;
  monitorIds: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

/** The state a notice shows at `now`: an incident's own; a maintenance's phase from its window. */
export function noticeState(notice: NoticeTiming, now: Date): NoticeState {
  if (notice.kind === 'INCIDENT') return notice.state;
  if (notice.resolvedAt || (notice.endsAt && now.getTime() >= notice.endsAt.getTime())) {
    return 'COMPLETED';
  }
  if (notice.startsAt && now.getTime() >= notice.startsAt.getTime()) return 'IN_PROGRESS';
  return 'SCHEDULED';
}

/** Open: an incident not resolved, or a maintenance not completed. */
export function isOpen(notice: NoticeTiming, now: Date): boolean {
  const state = noticeState(notice, now);
  return state !== 'RESOLVED' && state !== 'COMPLETED';
}

/** When it closed (null while open): resolved, ended early, or its window's end. */
export function closedAt(notice: NoticeTiming, now: Date): Date | null {
  if (isOpen(notice, now)) return null;
  return notice.resolvedAt ?? notice.endsAt;
}

/** The ids of the monitors under a maintenance in progress at `now`. */
export function monitorsInMaintenance(notices: NoticeTiming[], now: Date): Set<string> {
  const ids = new Set<string>();
  for (const notice of notices) {
    if (notice.kind === 'MAINTENANCE' && noticeState(notice, now) === 'IN_PROGRESS') {
      for (const id of notice.monitorIds) ids.add(id);
    }
  }
  return ids;
}

/** The time a maintenance actually covered (to its end, or to when it was ended early). */
export function maintenanceWindow(notice: NoticeTiming): { from: Date; to: Date } | null {
  if (notice.kind !== 'MAINTENANCE' || !notice.startsAt || !notice.endsAt) return null;
  const end = Math.min(notice.endsAt.getTime(), notice.resolvedAt?.getTime() ?? Infinity);
  return end > notice.startsAt.getTime() ? { from: notice.startsAt, to: new Date(end) } : null;
}

/** A monitor's maintenance windows among the notices. */
export function windowsFor(notices: NoticeTiming[], monitorId: string) {
  return notices
    .filter((notice) => notice.monitorIds.includes(monitorId))
    .map(maintenanceWindow)
    .filter((window): window is { from: Date; to: Date } => window !== null);
}

/**
 * A monitor's state changes with its maintenance windows taken out: inside a window the state is
 * PAUSED (not measured, like decision 62 says), and at its end the state in force comes back.
 */
export function withoutWindows(
  changes: StateChange[],
  windows: Array<{ from: Date; to: Date }>,
): StateChange[] {
  if (windows.length === 0) return changes;
  const sorted = changes.toSorted((a, b) => a.at.getTime() - b.at.getTime());
  const inside = (time: number) =>
    windows.some((window) => window.from.getTime() <= time && time < window.to.getTime());
  const times = [
    ...new Set([
      ...sorted.map((change) => change.at.getTime()),
      ...windows.flatMap((window) => [window.from.getTime(), window.to.getTime()]),
    ]),
  ].toSorted((a, b) => a - b);
  const result: StateChange[] = [];
  let index = 0;
  let current: StateChange | null = null;
  let last: MonitorState | null = null;
  for (const time of times) {
    while (index < sorted.length && sorted[index]!.at.getTime() <= time) current = sorted[index++]!;
    const paused = inside(time);
    const status: MonitorState = paused ? 'PAUSED' : (current?.status ?? 'UNKNOWN');
    if (status === last) continue;
    result.push({ status, at: new Date(time), error: paused ? null : (current?.error ?? null) });
    last = status;
  }
  return result;
}

/**
 * Why a maintenance window is refused, or null: the end after the start, at most 7 days long, the
 * start within the next 90 days; when `earliestStart` is given, the start not before it; when
 * `endSet` (a new maintenance or a changed end), the end in the future.
 */
export function windowProblem(
  startsAt: Date,
  endsAt: Date,
  now: Date,
  rules: { earliestStart: Date | null; endSet: boolean },
): string | null {
  const earliestStart = rules.earliestStart;
  if (endsAt.getTime() <= startsAt.getTime()) return 'The maintenance must end after it starts';
  if (rules.endSet && endsAt.getTime() <= now.getTime()) {
    return 'A maintenance must end in the future';
  }
  if (endsAt.getTime() - startsAt.getTime() > 7 * DAY) return 'A maintenance lasts at most 7 days';
  if (startsAt.getTime() > now.getTime() + 90 * DAY) {
    return 'A maintenance starts within the next 90 days';
  }
  if (earliestStart && startsAt.getTime() < earliestStart.getTime()) {
    return 'A maintenance can only start in the past when it is created, up to an hour back';
  }
  return null;
}

/** The earliest start a new maintenance may have: an hour back, to log one that just began. */
export function earliestNewStart(now: Date): Date {
  return new Date(now.getTime() - HOUR);
}

/**
 * The public page's order: open incidents (newest first), maintenance in progress, upcoming
 * maintenance (soonest first), then closed notices (newest closing first).
 */
export function publicOrder<T extends NoticeTiming>(notices: T[], now: Date): T[] {
  const rank = (notice: T) => {
    const state = noticeState(notice, now);
    if (!isOpen(notice, now)) return 3;
    if (notice.kind === 'INCIDENT') return 0;
    return state === 'IN_PROGRESS' ? 1 : 2;
  };
  const time = (notice: T, group: number) => {
    if (group === 0) return -notice.createdAt.getTime();
    if (group === 3) return -(closedAt(notice, now)?.getTime() ?? 0);
    return notice.startsAt?.getTime() ?? 0;
  };
  return notices
    .map((notice) => ({ notice, group: rank(notice) }))
    .toSorted((a, b) => a.group - b.group || time(a.notice, a.group) - time(b.notice, b.group))
    .map((row) => row.notice);
}
