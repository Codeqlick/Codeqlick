import tzLookup from '@photostructure/tz-lookup';

/**
 * Cruising phase 5's pure rules (architecture 4.15): a spot's busiest hours (decision 89), its
 * structured information (decision 92) and the contributor badges (decision 93).
 */

// ---- Structured spot information (decision 92) ---------------------------------------------------

export const SPOT_TAGS = [
  'NUDIST',
  'DAY',
  'NIGHT',
  'PARKING',
  'PUBLIC_TRANSPORT',
  'HARD_ACCESS',
  'LIT',
  'SECLUDED',
  'INDOOR',
  'ACCESSIBLE',
  'GLORY_HOLES',
  'DARKROOM',
] as const;
export type SpotTag = (typeof SPOT_TAGS)[number];

/** The website's English and Spanish labels of each tag (`Cruising.tags` in its messages). */
export const TAG_LABELS: Record<SpotTag, readonly [string, string]> = {
  NUDIST: ['Nudist', 'Nudista'],
  DAY: ['Daytime', 'De día'],
  NIGHT: ['Night-time', 'De noche'],
  PARKING: ['Parking', 'Aparcamiento'],
  PUBLIC_TRANSPORT: ['Public transport', 'Transporte público'],
  HARD_ACCESS: ['Hard to reach', 'Acceso difícil'],
  LIT: ['Lit at night', 'Iluminado'],
  SECLUDED: ['Secluded', 'Apartado'],
  INDOOR: ['Indoors', 'Interior'],
  ACCESSIBLE: ['Wheelchair accessible', 'Accesible'],
  GLORY_HOLES: ['Glory holes', 'Glory holes'],
  DARKROOM: ['Darkroom', 'Cuarto oscuro'],
};

/** Lower-case, no accents, single spaces: how labels are compared. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();
}

const TAG_BY_LABEL = new Map<string, SpotTag>(
  SPOT_TAGS.flatMap((tag) =>
    [tag, ...TAG_LABELS[tag]].map((label): [string, SpotTag] => [fold(label), tag]),
  ),
);

/** The tag a file names: the enum or its English or Spanish label, any case. Null: unknown. */
export function spotTagFromLabel(value: string): SpotTag | null {
  return TAG_BY_LABEL.get(fold(value)) ?? null;
}

/**
 * The tags of an import's cell: `|`-separated (or a GeoJSON array), each the enum or a label.
 * Unknown values are kept as written, so the proposal's checks refuse the row and say which.
 */
export function importedTags(value: unknown): unknown {
  if (value === undefined || value === null) return [];
  const parts = Array.isArray(value) ? value : typeof value === 'string' ? value.split('|') : null;
  if (!parts) return value;
  return parts
    .map((part) => (typeof part === 'string' ? part.trim() : part))
    .filter((part) => part !== '')
    .map((part) => (typeof part === 'string' ? (spotTagFromLabel(part) ?? part) : part));
}

/** Search engines' `amenityFeature` of a spot's tags (schema.org `LocationFeatureSpecification`). */
export function tagsToAmenities(tags: readonly SpotTag[]): string[] {
  return tags.map((tag) => TAG_LABELS[tag][0]);
}

// ---- Busiest hours (decision 89) -----------------------------------------------------------------

/** Every weight is multiplied by this once a day, so the last few months count most. */
export const HOURS_DECAY = 0.98;
/** The chart shows once this many check-ins were ever counted at the spot. */
export const HOURS_READY_AFTER = 10;
/** The decay runs for a spot once its last run is this old. */
export const HOURS_DECAY_EVERY_MS = 24 * 60 * 60 * 1000;

/** The IANA time zone of a point, from an offline lookup; `UTC` if the lookup fails. */
export function spotTimeZone(lat: number, lng: number): string {
  try {
    return tzLookup(lat, lng);
  } catch {
    return 'UTC';
  }
}

const WEEKDAYS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        hour: 'numeric',
        hourCycle: 'h23',
      });
    } catch {
      // An unknown zone (a newer tz name than this runtime knows): count in UTC.
      return formatterFor('UTC');
    }
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The day of the week (0 = Monday … 6 = Sunday) and hour (0-23) of an instant in `timeZone`. */
export function localDayHour(instant: Date, timeZone: string): { day: number; hour: number } {
  let day = 0;
  let hour = 0;
  for (const part of formatterFor(timeZone).formatToParts(instant)) {
    if (part.type === 'weekday') day = WEEKDAYS[part.value] ?? 0;
    if (part.type === 'hour') hour = Number(part.value) % 24;
  }
  return { day, hour };
}

/** Sampling step: no local hour is shorter (offsets and DST jumps are multiples of 15 minutes). */
const SAMPLE_MS = 10 * 60 * 1000;

/**
 * The hours of the week, in the spot's local time, that a check-in from `start` to `end` covers:
 * each local hour it overlaps, once, in order. Across midnight it moves to the next day; on a DST
 * change it follows the local clock (an hour skipped is never counted, a repeated one once).
 */
export function checkInHourSlots(
  start: Date,
  end: Date,
  timeZone: string,
): { day: number; hour: number }[] {
  const slots: { day: number; hour: number }[] = [];
  const seen = new Set<number>();
  const add = (instant: Date) => {
    const slot = localDayHour(instant, timeZone);
    const key = slot.day * 24 + slot.hour;
    if (seen.has(key)) return;
    seen.add(key);
    slots.push(slot);
  };
  const from = start.getTime();
  const to = end.getTime();
  if (to <= from) return slots;
  for (let at = from; at < to; at += SAMPLE_MS) add(new Date(at));
  add(new Date(to - 1));
  return slots;
}

/** An hour's weight as stored. */
export interface HourWeight {
  day: number;
  hour: number;
  weight: number;
}

/** A week of zeros: `[day][hour]`. */
export function emptyWeek(): number[][] {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
}

/** The week's weights scaled 0-100 against the busiest hour, rounded (all zero when empty). */
export function scaleWeek(rows: readonly HourWeight[]): number[][] {
  const week = emptyWeek();
  const max = rows.reduce((best, row) => Math.max(best, row.weight), 0);
  if (max <= 0) return week;
  for (const row of rows) {
    if (row.day < 0 || row.day > 6 || row.hour < 0 || row.hour > 23) continue;
    week[row.day]![row.hour] = Math.round((Math.max(row.weight, 0) / max) * 100);
  }
  return week;
}

/** A weight after `days` nightly decays. */
export function decayed(weight: number, days = 1): number {
  return weight * HOURS_DECAY ** days;
}

// ---- Contributor badges (decision 93) ------------------------------------------------------------

export const CONTRIBUTOR_BADGES = ['EXPLORER', 'GUIDE', 'HELPFUL', 'LOCAL'] as const;
export type ContributorBadge = (typeof CONTRIBUTOR_BADGES)[number];

/** Thresholds: Explorer 3 LIVE spots, Guide 10, Helpful 10 helpful votes, Local 25 reviews. */
export const BADGE_THRESHOLDS = { explorer: 3, guide: 10, helpful: 10, local: 25 } as const;

export interface ContributorCounters {
  spotsLive: number;
  helpfulReceived: number;
  reviewsWritten: number;
}

/**
 * The badges a member's counters earn. Guide is Explorer's next step: a member with 10 LIVE spots
 * shows Guide only.
 */
export function contributorBadges(counters: ContributorCounters): ContributorBadge[] {
  const badges: ContributorBadge[] = [];
  if (counters.spotsLive >= BADGE_THRESHOLDS.guide) badges.push('GUIDE');
  else if (counters.spotsLive >= BADGE_THRESHOLDS.explorer) badges.push('EXPLORER');
  if (counters.helpfulReceived >= BADGE_THRESHOLDS.helpful) badges.push('HELPFUL');
  if (counters.reviewsWritten >= BADGE_THRESHOLDS.local) badges.push('LOCAL');
  return badges;
}

/** How reviews are listed: most helpful votes first, then newest, then by id (stable pages). */
export function compareReviews(
  a: { helpful: number; createdAt: Date; id: string },
  b: { helpful: number; createdAt: Date; id: string },
): number {
  return (
    b.helpful - a.helpful ||
    b.createdAt.getTime() - a.createdAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}
