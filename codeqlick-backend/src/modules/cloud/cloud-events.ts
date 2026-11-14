import { CSV_BOM, csvLine } from '../../common/csv.js';
import { madridDay } from './cloud-analytics.js';

/**
 * A team's events: the list's filters and the CSV export (architecture 4.13 "Exporting
 * events"). Pure functions, tested on their own.
 */

/** Without `from`/`to`, the export covers the last 30 Madrid days (today included). */
export const EXPORT_DEFAULT_DAYS = 30;
/** `from` and `to` are at most this many days apart. */
export const MAX_RANGE_DAYS = 365;
/** The export reads and writes this many rows at a time. */
export const EXPORT_PAGE_SIZE = 1_000;

const DAY_MS = 86_400_000;

/** Whether `value` is a real calendar day written `YYYY-MM-DD`. */
export function isCalendarDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

/** The calendar day `n` days after `day` (`YYYY-MM-DD`; `n` may be negative). */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

/** Days from `from` to `to` (0 when they are the same day, negative when `to` comes first). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

const madridClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** How far Madrid's wall clock is ahead of UTC at `instant` (ms). */
function madridOffset(instant: number): number {
  const parts = Object.fromEntries(
    madridClock
      .formatToParts(new Date(instant))
      .map((part): [string, number] => [part.type, Number(part.value)]),
  );
  const wall = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return wall - Math.floor(instant / 1000) * 1000;
}

/**
 * The instant a Madrid calendar day starts. Two passes over the offset, so the days the clocks
 * change (the last Sundays of March and October) start at their own midnight.
 */
export function madridDayStart(day: string): Date {
  const wall = Date.parse(`${day}T00:00:00Z`);
  const first = wall - madridOffset(wall);
  return new Date(wall - madridOffset(first));
}

/** Why `from`–`to` is not a valid period, or null when it is. */
export function rangeError(from: string, to: string): string | null {
  const span = daysBetween(from, to);
  if (span < 0) return '`from` must not be after `to`';
  if (span > MAX_RANGE_DAYS)
    return `\`from\` and \`to\` must be at most ${MAX_RANGE_DAYS} days apart`;
  return null;
}

/** The export's period: what was asked, the rest by default (the last 30 days up to today). */
export function exportRange(
  input: { from?: string | undefined; to?: string | undefined },
  now = new Date(),
): { from: string; to: string } {
  const to = input.to ?? madridDay(now);
  const from = input.from ?? addDays(to, -(EXPORT_DEFAULT_DAYS - 1));
  return { from, to };
}

/** Events kept by the filters: `since` inclusive, `until` exclusive (UTC instants). */
export interface EventsFilter {
  since?: Date | undefined;
  until?: Date | undefined;
  action?: { equals: string } | { startsWith: string } | undefined;
}

/** `action`: exact (`domain.added`), or every action with a prefix that ends in `.` (`domain.`). */
export function actionFilter(action: string): { equals: string } | { startsWith: string } {
  return action.endsWith('.') ? { startsWith: action } : { equals: action };
}

/** The filters from Madrid days (`from` and `to` inclusive) and an action. */
export function eventsFilter(input: {
  from?: string | undefined;
  to?: string | undefined;
  action?: string | undefined;
}): EventsFilter {
  return {
    since: input.from ? madridDayStart(input.from) : undefined,
    until: input.to ? madridDayStart(addDays(input.to, 1)) : undefined,
    action: input.action ? actionFilter(input.action) : undefined,
  };
}

/** One stored event as the export reads it. */
export interface EventCsvRow {
  id: string;
  createdAt: Date;
  actorName: string;
  tokenName: string | null;
  action: string;
  targetLabel: string | null;
  details: unknown;
  ip: string | null;
}

/** Where the next page starts: after this row, newest first (`createdAt` desc, `id` desc). */
export interface EventCursor {
  createdAt: Date;
  id: string;
}

export const EVENTS_CSV_COLUMNS = ['date', 'actor', 'token', 'action', 'target', 'details', 'ip'];

/** One event as a CSV line (date in UTC ISO 8601, details as JSON). */
export function eventCsvLine(row: EventCsvRow): string {
  return csvLine([
    row.createdAt.toISOString(),
    row.actorName,
    row.tokenName,
    row.action,
    row.targetLabel,
    row.details === null || row.details === undefined ? null : JSON.stringify(row.details),
    row.ip,
  ]);
}

/**
 * The export, written as it is read: the BOM and header, then a chunk per page of rows, each
 * page starting after the last row of the one before (keyset, so a busy year never sits in
 * memory and rows recorded meanwhile don't shift the pages).
 */
export async function* eventsCsv(
  page: (after: EventCursor | null, take: number) => Promise<EventCsvRow[]>,
  pageSize = EXPORT_PAGE_SIZE,
): AsyncGenerator<string> {
  yield `${CSV_BOM}${csvLine(EVENTS_CSV_COLUMNS)}`;
  let after: EventCursor | null = null;
  for (;;) {
    const rows = await page(after, pageSize);
    if (rows.length > 0) yield rows.map(eventCsvLine).join('');
    if (rows.length < pageSize) return;
    const last = rows[rows.length - 1]!;
    after = { createdAt: last.createdAt, id: last.id };
  }
}
