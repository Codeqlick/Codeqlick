/**
 * Cruising's phase 5 on the website (architecture 4.15): meetups (decision 88), trips (decision 90)
 * and safety alerts (decision 91). Pure helpers, shared by the pages, the actions and the tests.
 */
import { cruisingPath, REVIEW_REPORT_REASONS, type CruisingReportReason } from '@/lib/cruising';

/** What a meetup or a safety alert can be reported for: like a review, a wrong detail is a place's. */
export const COMMUNITY_REPORT_REASONS: readonly CruisingReportReason[] = REVIEW_REPORT_REASONS;

export const SAFETY_KINDS = [
  'POLICE',
  'THEFT',
  'AGGRESSION',
  'SURVEILLANCE',
  'CLOSED',
  'OTHER',
] as const;
export type SafetyKind = (typeof SAFETY_KINDS)[number];

export function isSafetyKind(value: unknown): value is SafetyKind {
  return SAFETY_KINDS.some((kind) => kind === value);
}

/** How long a meetup can last, in hours. */
export const MEETUP_HOURS = [1, 2, 3, 4] as const;
export const MEETUP_LIMITS = { title: 80, description: 500, minCapacity: 2, maxCapacity: 50 };
/** The longest note on a safety alert. */
export const SAFETY_NOTE_MAX = 200;
/** A trip starts at most this many days ahead and lasts at most this many days. */
export const TRIP_MAX_DAYS_AHEAD = 60;
export const TRIP_MAX_DAYS = 14;

export const MEETUPS_HREF = '/cruising/meetups';
export const TRIPS_HREF = '/cruising/trips';

/** What the map asks for the spots with active safety alerts (entered members only). */
export function alertsEndpoint(locale: string, onHost: boolean): string {
  return cruisingPath(locale, '/api/alerts', onHost);
}

/** The message keys of a meetup form's errors (`Cruising.meetups.errors`). */
export type MeetupErrorKey =
  'startsAt' | 'tooSoon' | 'tooFar' | 'hours' | 'title' | 'description' | 'capacity';

export type MeetupFormErrors = Partial<
  Record<'startsAt' | 'hours' | 'title' | 'description' | 'capacity', MeetupErrorKey>
>;

export type MeetupForm = {
  startsAt: string;
  hours: number;
  title: string;
  description: string;
  capacity: number | null;
};

/**
 * A meetup's form, checked before the API: `startsAt` comes as an ISO instant made in the browser
 * from the local date and time it shows. Error values are message keys.
 */
export function parseMeetupForm(
  values: {
    startsAt: unknown;
    hours: unknown;
    title: unknown;
    description: unknown;
    capacity: unknown;
  },
  now: Date = new Date(),
): { value: MeetupForm | null; errors: MeetupFormErrors } {
  const errors: MeetupFormErrors = {};
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const startsAt = new Date(text(values.startsAt));
  const ahead = startsAt.getTime() - now.getTime();
  if (Number.isNaN(startsAt.getTime())) errors.startsAt = 'startsAt';
  else if (ahead < 30 * 60 * 1000) errors.startsAt = 'tooSoon';
  else if (ahead > 30 * 24 * 60 * 60 * 1000) errors.startsAt = 'tooFar';
  const hours = Number(text(values.hours));
  if (!MEETUP_HOURS.some((value) => value === hours)) errors.hours = 'hours';
  const title = text(values.title);
  if (title.length < 3 || title.length > MEETUP_LIMITS.title) errors.title = 'title';
  const description = text(values.description);
  if (description.length > MEETUP_LIMITS.description) errors.description = 'description';
  const capacityText = text(values.capacity);
  const capacity = capacityText === '' ? null : Number(capacityText);
  if (
    capacity !== null &&
    (!Number.isInteger(capacity) ||
      capacity < MEETUP_LIMITS.minCapacity ||
      capacity > MEETUP_LIMITS.maxCapacity)
  ) {
    errors.capacity = 'capacity';
  }
  if (Object.keys(errors).length > 0) return { value: null, errors };
  return {
    value: { startsAt: startsAt.toISOString(), hours, title, description, capacity },
    errors,
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Today in UTC as `YYYY-MM-DD` (the API counts trips in UTC days). */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** `day` moved by `days`, as `YYYY-MM-DD`. */
export function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Why a trip's dates are refused (a message key), or null. */
export function tripDatesError(
  from: string,
  to: string,
  now: Date = new Date(),
): 'dates' | 'past' | 'tooFar' | 'order' | 'tooLong' | null {
  if (!DAY.test(from) || !DAY.test(to)) return 'dates';
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 'dates';
  const today = Date.parse(`${todayUtc(now)}T00:00:00Z`);
  if (start < today) return 'past';
  if (start > today + TRIP_MAX_DAYS_AHEAD * DAY_MS) return 'tooFar';
  if (end < start) return 'order';
  if ((end - start) / DAY_MS + 1 > TRIP_MAX_DAYS) return 'tooLong';
  return null;
}

/** A day as the person reads it (`YYYY-MM-DD` is a calendar day: shown in UTC). */
export function formatTripDay(day: string, locale: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

/** How long ago something happened, rounded to minutes, hours or days. */
export function ageOf(
  iso: string,
  now: Date = new Date(),
): { unit: 'minutes' | 'hours' | 'days'; count: number } {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 60) return { unit: 'minutes', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return { unit: 'hours', count: hours };
  return { unit: 'days', count: Math.floor(hours / 24) };
}

/** Spot id → active safety alerts, from the answers of several grid cells. */
export function alertCounts(
  results: readonly { items: readonly { spotId: string; alerts: number }[] }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const result of results) {
    for (const item of result.items) counts.set(item.spotId, item.alerts);
  }
  return counts;
}

/**
 * A reported meetup or alert as the team sees it: the API sends `{ type, meetup }` or
 * `{ type, alert }`; whatever is missing stays null.
 */
export function reportedCommunityTarget(target: unknown): {
  title: string | null;
  text: string | null;
  kind: string | null;
  spotName: string | null;
  spotSlug: string | null;
} {
  const object = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
  const text = (value: unknown): string | null => (typeof value === 'string' ? value : null);
  const root = object(target);
  const item = object(root?.meetup) ?? object(root?.alert);
  const spot = object(item?.spot);
  return {
    title: text(item?.title),
    text: text(item?.description) || text(item?.note),
    kind: text(item?.kind),
    spotName: text(spot?.name),
    spotSlug: text(spot?.slug),
  };
}
