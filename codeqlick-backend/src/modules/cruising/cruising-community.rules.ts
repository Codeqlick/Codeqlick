/**
 * Pure rules of Cruising's phase 5 (architecture 4.15): meetups (decision 88), trips (decision 90)
 * and safety alerts (decision 91). Times are UTC; a trip's days are calendar days (UTC).
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// ---- Meetups (decision 88) -----------------------------------------------------------------------

/** A meetup starts at least this far ahead… */
export const MEETUP_MIN_AHEAD_MS = 30 * MINUTE_MS;
/** …and at most this far. */
export const MEETUP_MAX_AHEAD_MS = 30 * DAY_MS;
/** It lasts 1 to 4 whole hours. */
export const MEETUP_MIN_HOURS = 1;
export const MEETUP_MAX_HOURS = 4;
/** Attendees a meetup can cap at (the host not counted). */
export const MEETUP_MIN_CAPACITY = 2;
export const MEETUP_MAX_CAPACITY = 50;
/** New meetups a member can plan in 7 days. */
export const MEETUPS_PER_WEEK = 3;
export const WEEK_MS = 7 * DAY_MS;
/** A meetup is deleted this long after it ends. */
export const MEETUP_KEEP_MS = 7 * DAY_MS;

/** Why a meetup's time is refused, or null when it is fine. */
export function meetupTimeProblem(
  startsAt: Date,
  hours: number,
  now: Date,
): 'too-soon' | 'too-far' | 'duration' | null {
  if (!Number.isInteger(hours) || hours < MEETUP_MIN_HOURS || hours > MEETUP_MAX_HOURS) {
    return 'duration';
  }
  const ahead = startsAt.getTime() - now.getTime();
  if (ahead < MEETUP_MIN_AHEAD_MS) return 'too-soon';
  if (ahead > MEETUP_MAX_AHEAD_MS) return 'too-far';
  return null;
}

/** When a meetup of `hours` starting at `startsAt` ends. */
export function meetupEnd(startsAt: Date, hours: number): Date {
  return new Date(startsAt.getTime() + hours * HOUR_MS);
}

/** Whether one more person can say "I'm going" (`going` counts everyone already in). */
export function meetupHasRoom(capacity: number | null, going: number): boolean {
  return capacity === null || going < capacity;
}

/** A meetup can still be joined or cancelled until it ends. */
export function meetupIsOver(endsAt: Date, now: Date): boolean {
  return endsAt.getTime() <= now.getTime();
}

// ---- Trips (decision 90) -------------------------------------------------------------------------

/** A trip starts at most this many days from today… */
export const TRIP_MAX_DAYS_AHEAD = 60;
/** …and lasts at most this many days, both ends included. */
export const TRIP_MAX_DAYS = 14;
/** Upcoming trips a member can have. */
export const MAX_UPCOMING_TRIPS = 3;
/** "Visiting soon" lists the trips overlapping this many days from today. */
export const VISITORS_WINDOW_DAYS = 60;

/** Today's date at 00:00 UTC. */
export function utcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** `YYYY-MM-DD` as a date at 00:00 UTC. */
export function parseDay(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

/** A date as `YYYY-MM-DD`. */
export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `day` moved by `days`. */
export function addDays(day: Date, days: number): Date {
  return new Date(day.getTime() + days * DAY_MS);
}

/** Why a trip's dates are refused, or null when they are fine. */
export function tripDatesProblem(
  from: Date,
  to: Date,
  now: Date,
): 'past' | 'too-far' | 'order' | 'too-long' | null {
  const today = utcDay(now);
  if (from.getTime() < today.getTime()) return 'past';
  if (from.getTime() > addDays(today, TRIP_MAX_DAYS_AHEAD).getTime()) return 'too-far';
  if (to.getTime() < from.getTime()) return 'order';
  if ((to.getTime() - from.getTime()) / DAY_MS + 1 > TRIP_MAX_DAYS) return 'too-long';
  return null;
}

/** Trips whose last day is before this are over (deleted the day after they end). */
export function tripsOverBefore(now: Date): Date {
  return utcDay(now);
}

// ---- Safety alerts (decision 91) -----------------------------------------------------------------

export const SAFETY_KINDS = [
  'POLICE',
  'THEFT',
  'AGGRESSION',
  'SURVEILLANCE',
  'CLOSED',
  'OTHER',
] as const;
export type SafetyKind = (typeof SAFETY_KINDS)[number];

/** How long a new alert lasts. */
export const SAFETY_LIFETIME_MS = 6 * HOUR_MS;
/** A place reported closed is worth knowing about for longer. */
export const SAFETY_CLOSED_LIFETIME_MS = 7 * DAY_MS;
/** Each confirmation adds this… */
export const SAFETY_CONFIRM_MS = 3 * HOUR_MS;
/** …up to this long after the alert was posted. */
export const SAFETY_CONFIRM_CAP_MS = 24 * HOUR_MS;
/** This many "gone" end an alert. */
export const SAFETY_GONE_TO_END = 3;
/** Alerts a member can post a day. */
export const SAFETY_ALERTS_PER_DAY = 5;
/** Expired alerts are deleted this long after. */
export const SAFETY_KEEP_MS = DAY_MS;

/** When a new alert of `kind` posted at `now` expires. */
export function safetyExpiry(kind: SafetyKind, now: Date): Date {
  return new Date(
    now.getTime() + (kind === 'CLOSED' ? SAFETY_CLOSED_LIFETIME_MS : SAFETY_LIFETIME_MS),
  );
}

/**
 * The expiry after a confirmation: 3 hours more, but never past 24 hours from the alert's
 * creation; it never shortens one that already lasts longer (a CLOSED alert's 7 days).
 */
export function confirmedExpiry(createdAt: Date, expiresAt: Date): Date {
  const extended = Math.min(
    expiresAt.getTime() + SAFETY_CONFIRM_MS,
    createdAt.getTime() + SAFETY_CONFIRM_CAP_MS,
  );
  return new Date(Math.max(expiresAt.getTime(), extended));
}

/** Whether this many "gone" end the alert. */
export function goneEnds(gone: number): boolean {
  return gone >= SAFETY_GONE_TO_END;
}

/** Active: not expired and not hidden by a report. */
export function safetyActive(alert: { expiresAt: Date; hidden: boolean }, now: Date): boolean {
  return !alert.hidden && alert.expiresAt.getTime() > now.getTime();
}
