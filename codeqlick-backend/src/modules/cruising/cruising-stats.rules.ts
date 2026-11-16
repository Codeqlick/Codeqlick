import type { Bbox } from './cruising.rules.js';

/**
 * Cruising phase 6's pure rules (architecture 4.15): the admin statistics (decision 101) and the
 * onboarding's suggestions (decision 102).
 */

// ---- Admin statistics (decision 101) -------------------------------------------------------------

/** Weeks are counted in the studio's time zone, Monday to Sunday, like the other statistics. */
export const STATS_TIME_ZONE = 'Europe/Madrid';
/** The weeks shown, the current one included. */
export const STATS_WEEKS = 12;
/** The figures are computed on request and kept this long. */
export const STATS_CACHE_MS = 10 * 60 * 1000;
/** Places in each top list. */
export const STATS_TOP = 10;
/** The top places by check-ins look this far back. */
export const STATS_CHECK_IN_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** `yyyy-mm-dd` of an instant in Europe/Madrid. */
export function madridDay(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: STATS_TIME_ZONE }).format(instant);
}

/** `day` (`yyyy-mm-dd`) moved by `days`. */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday (`yyyy-mm-dd`) of the Madrid week an instant falls in. */
export function madridWeekStart(instant: Date): string {
  const day = madridDay(instant);
  // 0 = Monday … 6 = Sunday (getUTCDay is 0 for Sunday).
  const weekday = (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(day, -weekday);
}

/** The Mondays of the last `count` weeks, oldest first, the current week last. */
export function statsWeekStarts(now: Date, count = STATS_WEEKS): string[] {
  const current = madridWeekStart(now);
  return Array.from({ length: count }, (_, index) => addDays(current, (index - count + 1) * 7));
}

/** A median in hours, to one decimal; null when nothing was decided that week. */
export function roundHours(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(Math.max(0, value) * 10) / 10;
}

/** One value kept for `ttlMs` (the statistics' 10 minutes), in this process's memory. */
export class TimedCache<T> {
  private entry: { value: T; until: number } | null = null;

  constructor(private readonly ttlMs: number) {}

  get(now: Date): T | null {
    if (!this.entry || this.entry.until <= now.getTime()) return null;
    return this.entry.value;
  }

  set(value: T, now: Date): void {
    this.entry = { value, until: now.getTime() + this.ttlMs };
  }

  clear(): void {
    this.entry = null;
  }
}

// ---- Onboarding (decision 102) -------------------------------------------------------------------

/** Spots suggested at most. */
export const SUGGESTIONS_LIMIT = 12;
/** The map's grid (the website snaps its boxes to it): the box says no more than a cell. */
export const SUGGESTIONS_GRID = 0.25;

/** Whether every edge of the box is on the 0.25° grid (multiples of 0.25 are exact in binary). */
export function isGridBbox(box: Bbox, step = SUGGESTIONS_GRID): boolean {
  return [box.minLng, box.minLat, box.maxLng, box.maxLat].every((value) =>
    Number.isInteger(value / step),
  );
}
