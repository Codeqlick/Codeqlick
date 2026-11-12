import { madridDay, madridToUtc } from '../bookings/booking-time.js';

/** Uptime of a Cloud monitor from its state changes (architecture 4.13, Monitors). Pure. */

export type MonitorState = 'UNKNOWN' | 'UP' | 'DOWN' | 'PAUSED';

export interface StateChange {
  status: MonitorState;
  at: Date;
  error?: string | null;
}

export interface DayUptime {
  /** `yyyy-mm-dd` in Madrid. */
  day: string;
  /** 0–1: the share of the day's measured time that wasn't DOWN; null when nothing was measured. */
  ratio: number | null;
}

export interface Incident {
  start: string;
  /** Null while it is still down. */
  end: string | null;
  minutes: number;
  error: string | null;
}

/** The state in force at each moment: spans [from, to) with their state, from `since` to `until`. */
function spans(
  changes: StateChange[],
  since: Date,
  until: Date,
): Array<{ from: number; to: number; status: MonitorState }> {
  const sorted = changes.toSorted((a, b) => a.at.getTime() - b.at.getTime());
  const result: Array<{ from: number; to: number; status: MonitorState }> = [];
  let status: MonitorState = 'UNKNOWN';
  let from = since.getTime();
  for (const change of sorted) {
    const at = change.at.getTime();
    if (at <= from) {
      status = change.status;
      continue;
    }
    if (at >= until.getTime()) break;
    result.push({ from, to: at, status });
    status = change.status;
    from = at;
  }
  if (from < until.getTime()) result.push({ from, to: until.getTime(), status });
  return result;
}

/** Measured (UP or DOWN) and down milliseconds between two instants. */
function measure(changes: StateChange[], from: Date, to: Date): { measured: number; down: number } {
  let measured = 0;
  let down = 0;
  for (const span of spans(changes, from, to)) {
    const length = span.to - span.from;
    if (span.status === 'UP' || span.status === 'DOWN') measured += length;
    if (span.status === 'DOWN') down += length;
  }
  return { measured, down };
}

/** The last `days` Madrid days, oldest first, today (up to `now`) included. */
export function dailyUptime(changes: StateChange[], days: number, now: Date): DayUptime[] {
  const today = madridDay(now);
  const result: DayUptime[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - offset);
    const day = date.toISOString().slice(0, 10);
    const start = madridToUtc(day, '00:00');
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const end = offset === 0 ? now : madridToUtc(next.toISOString().slice(0, 10), '00:00');
    const { measured, down } = measure(changes, start, end);
    result.push({ day, ratio: measured > 0 ? 1 - down / measured : null });
  }
  return result;
}

/** Uptime over a window, or null when nothing was measured. */
export function uptime(changes: StateChange[], from: Date, to: Date): number | null {
  const { measured, down } = measure(changes, from, to);
  return measured > 0 ? 1 - down / measured : null;
}

/** The DOWN spans that overlap the window, newest first. */
export function incidents(changes: StateChange[], from: Date, now: Date): Incident[] {
  const sorted = changes.toSorted((a, b) => a.at.getTime() - b.at.getTime());
  const result: Incident[] = [];
  for (let index = 0; index < sorted.length; index++) {
    const change = sorted[index]!;
    if (change.status !== 'DOWN') continue;
    const next = sorted.slice(index + 1).find((c) => c.status !== 'DOWN');
    const end = next?.at ?? null;
    if ((end ?? now) < from) continue;
    result.push({
      start: change.at.toISOString(),
      end: end?.toISOString() ?? null,
      minutes: Math.max(1, Math.round(((end ?? now).getTime() - change.at.getTime()) / 60_000)),
      error: change.error ?? null,
    });
  }
  return result.toReversed();
}

/** The overall state of a set of monitors, as a status page says it. */
export function overall(states: MonitorState[]): 'operational' | 'partial' | 'major' | 'unknown' {
  const live = states.filter((s) => s === 'UP' || s === 'DOWN');
  if (live.length === 0) return 'unknown';
  const down = live.filter((s) => s === 'DOWN').length;
  if (down === 0) return 'operational';
  return down === live.length ? 'major' : 'partial';
}
