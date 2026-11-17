import type { Bbox } from './cruising.rules.js';

/**
 * Cruising phase 6's pure rules (architecture 4.15): the admin statistics (decision 101) and the
 * onboarding's suggestions (decision 102).
 */

// ---- Admin statistics (decision 101) -------------------------------------------------------------

/** Weeks, their bucketing and the 10-minute cache are shared with the admin overview. */
export {
  addDays,
  madridDay,
  madridWeekStart,
  STATS_CACHE_MS,
  STATS_TIME_ZONE,
  STATS_WEEKS,
  statsWeekStarts,
  TimedCache,
} from '../../common/stats-weeks.js';
/** Places in each top list. */
export const STATS_TOP = 10;
/** The top places by check-ins look this far back. */
export const STATS_CHECK_IN_DAYS = 30;

/** A median in hours, to one decimal; null when nothing was decided that week. */
export function roundHours(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Math.round(Math.max(0, value) * 10) / 10;
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
