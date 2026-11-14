/**
 * Status page notices: incidents and scheduled maintenance (architecture 4.13, Notices; decision
 * 62). Pure: server and client.
 */
import type { BadgeTone } from '@/components/ui/Badge';
import type { CloudNoticeKind, CloudNoticeState, CloudPublicNotice } from '@/lib/api/cloud';
import { fromDateTimeInput } from '@/lib/format';

export const INCIDENT_STATES = ['INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED'] as const;

const DAY = 86_400_000;

/** Open: an incident not resolved, or a maintenance not completed. */
export function isNoticeOpen(state: CloudNoticeState): boolean {
  return state !== 'RESOLVED' && state !== 'COMPLETED';
}

/** The badge colour of a notice's state: incidents in alarm colours, maintenance calm. */
export function noticeTone(kind: CloudNoticeKind, state: CloudNoticeState): BadgeTone {
  if (state === 'RESOLVED' || state === 'COMPLETED') return 'success';
  if (kind === 'MAINTENANCE') return 'info';
  return state === 'INVESTIGATING' ? 'danger' : 'warning';
}

/**
 * The states an update may set: an incident's four (any order); a maintenance's update is a note
 * ('' = no state) or COMPLETED to end it early.
 */
export function updateStates(kind: CloudNoticeKind): ReadonlyArray<CloudNoticeState | ''> {
  return kind === 'INCIDENT' ? INCIDENT_STATES : ['', 'COMPLETED'];
}

/** A state sent by a form, kept only when the notice's kind allows it ('' for a note). */
export function parseUpdateState(
  kind: CloudNoticeKind,
  value: string,
): CloudNoticeState | '' | null {
  const allowed = updateStates(kind) as ReadonlyArray<string>;
  return allowed.includes(value) ? (value as CloudNoticeState | '') : null;
}

export type NoticeWindow = { startsAt: string; endsAt: string };

export type NoticeWindowResult =
  | { ok: true; window: NoticeWindow }
  | { ok: false; field: 'startsAt' | 'endsAt'; problem: 'date' | 'window' };

/**
 * A maintenance window typed as `datetime-local` in Madrid time, or why it's refused: `date` (not
 * a date-time) or `window` (the end not after the start, or longer than 7 days). The API checks
 * the rest (the start within 90 days, not in the past).
 */
export function parseNoticeWindow(start: string, end: string): NoticeWindowResult {
  const startsAt = fromDateTimeInput(start);
  if (!startsAt) return { ok: false, field: 'startsAt', problem: 'date' };
  const endsAt = fromDateTimeInput(end);
  if (!endsAt) return { ok: false, field: 'endsAt', problem: 'date' };
  const length = Date.parse(endsAt) - Date.parse(startsAt);
  if (length <= 0 || length > 7 * DAY) return { ok: false, field: 'endsAt', problem: 'window' };
  return { ok: true, window: { startsAt, endsAt } };
}

export type PublicNoticeGroups<T> = {
  /** Open incidents, newest first. */
  incidents: T[];
  /** Maintenance in progress, the earliest start first. */
  inProgress: T[];
  /** Upcoming maintenance, the soonest first. */
  upcoming: T[];
  /** Closed in the last 14 days, the latest closing first. */
  closed: T[];
};

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : 0);

/** The public page's groups: open notices on top in this order, closed ones in the history. */
export function groupPublicNotices<
  T extends Pick<
    CloudPublicNotice,
    'kind' | 'state' | 'startsAt' | 'endsAt' | 'resolvedAt' | 'createdAt'
  >,
>(notices: T[]): PublicNoticeGroups<T> {
  const groups: PublicNoticeGroups<T> = { incidents: [], inProgress: [], upcoming: [], closed: [] };
  for (const notice of notices) {
    if (!isNoticeOpen(notice.state)) groups.closed.push(notice);
    else if (notice.kind === 'INCIDENT') groups.incidents.push(notice);
    else if (notice.state === 'IN_PROGRESS') groups.inProgress.push(notice);
    else groups.upcoming.push(notice);
  }
  groups.incidents.sort((a, b) => time(b.createdAt) - time(a.createdAt));
  groups.inProgress.sort((a, b) => time(a.startsAt) - time(b.startsAt));
  groups.upcoming.sort((a, b) => time(a.startsAt) - time(b.startsAt));
  const closedAt = (notice: T) => time(notice.resolvedAt ?? notice.endsAt ?? notice.createdAt);
  groups.closed.sort((a, b) => closedAt(b) - closedAt(a));
  return groups;
}

/** The names of a notice's monitors among the team's, in the team's order. */
export function noticeMonitorNames(
  monitorIds: string[],
  monitors: Array<{ id: string; name: string }>,
): string[] {
  return monitors.filter((monitor) => monitorIds.includes(monitor.id)).map((m) => m.name);
}
