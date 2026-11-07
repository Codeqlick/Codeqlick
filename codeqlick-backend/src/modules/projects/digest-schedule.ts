/** The weekly summary goes out on Mondays from this hour, Madrid time. */
export const DIGEST_HOUR = 8;
const TIME_ZONE = 'Europe/Madrid';
const DAY_MS = 86_400_000;

/** Madrid wall-clock parts of `date`. */
export function madridParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: get('weekday'),
  };
}

/** How far Madrid is ahead of UTC at `instant`, in ms. */
function madridOffset(instant: number): number {
  const p = madridParts(new Date(instant));
  return (
    Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(instant / 60_000) * 60_000
  );
}

/** The UTC instant of `y-m-d h:00` in Madrid (DST-aware: two passes over the offset). */
export function madridInstant(year: number, month: number, day: number, hour: number): Date {
  const wallClock = Date.UTC(year, month - 1, day, hour);
  const first = wallClock - madridOffset(wallClock);
  return new Date(wallClock - madridOffset(first));
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Start of the current digest week: the latest Monday at DIGEST_HOUR (Madrid) not after `now`.
 * A client whose last summary is older than this gets this week's one.
 */
export function digestWeekStart(now: Date): Date {
  const today = madridParts(now);
  const daysSinceMonday = WEEKDAYS.indexOf(today.weekday);
  // Walk back to Monday's date in Madrid, then take its DIGEST_HOUR.
  const monday = new Date(
    Date.UTC(today.year, today.month - 1, today.day) - daysSinceMonday * DAY_MS,
  );
  let start = madridInstant(
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate(),
    DIGEST_HOUR,
  );
  if (start.getTime() > now.getTime()) {
    const previous = new Date(monday.getTime() - 7 * DAY_MS);
    start = madridInstant(
      previous.getUTCFullYear(),
      previous.getUTCMonth() + 1,
      previous.getUTCDate(),
      DIGEST_HOUR,
    );
  }
  return start;
}
