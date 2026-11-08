/**
 * Calendar arithmetic for bookings: free hours are wall-clock times in a time zone (the team's are
 * Madrid's; a Citas page has its own).
 */

export const TIME_ZONE = 'Europe/Madrid';
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type Interval = { start: string; end: string };

const formatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Whether the runtime knows this IANA time zone (`Europe/Madrid`, `America/Bogota`…). */
export function isTimeZone(timeZone: string): boolean {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone }).resolvedOptions().timeZone !== '';
  } catch {
    return false;
  }
}

/** Minutes the zone is ahead of UTC at that instant (Madrid: 60 in winter, 120 in summer). */
function offsetMinutes(instant: number, timeZone: string): number {
  const p = Object.fromEntries(
    partsIn(timeZone)
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const wall = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return Math.round((wall - Math.floor(instant / 1000) * 1000) / 60_000);
}

/** The instant of a wall-clock time (`yyyy-mm-dd`, `HH:MM`) in a time zone. */
export function zonedToUtc(day: string, time: string, timeZone: string): Date {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  const wall = Date.UTC(year, month - 1, date, hour, minute);
  let instant = wall - offsetMinutes(wall, timeZone) * 60_000;
  // Near a clock change the first guess can use the other side's offset.
  const corrected = wall - offsetMinutes(instant, timeZone) * 60_000;
  if (corrected !== instant) instant = corrected;
  return new Date(instant);
}

/** The instant of a Madrid wall-clock time (`yyyy-mm-dd`, `HH:MM`). */
export function madridToUtc(day: string, time: string): Date {
  return zonedToUtc(day, time, TIME_ZONE);
}

/** The date of an instant in a time zone, as `yyyy-mm-dd`. */
export function zonedDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);
}

/** The Madrid date of an instant, as `yyyy-mm-dd`. */
export function madridDay(instant: Date): string {
  return zonedDay(instant, TIME_ZONE);
}

/** `yyyy-mm-dd` plus `days`. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekdayOf(day: string): Weekday {
  // getUTCDay: 0 is Sunday.
  return WEEKDAYS[(new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7]!;
}

/**
 * Free start times: every `duration` minutes inside the weekly intervals, from `now + notice`
 * to the end of the horizon (in days of the time zone, Madrid unless given), minus those
 * overlapping a booked call.
 */
export function freeSlots(options: {
  weekly: Record<Weekday, Interval[]>;
  durationMinutes: number;
  minNoticeHours: number;
  horizonDays: number;
  now: Date;
  booked: { startsAt: Date; endsAt: Date }[];
  timeZone?: string;
}): Date[] {
  const { weekly, durationMinutes, now } = options;
  const timeZone = options.timeZone ?? TIME_ZONE;
  const earliest = now.getTime() + options.minNoticeHours * 3_600_000;
  const length = durationMinutes * 60_000;
  const today = zonedDay(now, timeZone);
  const slots: Date[] = [];
  for (let offset = 0; offset <= options.horizonDays; offset++) {
    const day = addDays(today, offset);
    for (const interval of weekly[weekdayOf(day)]) {
      const end = zonedToUtc(day, interval.end, timeZone).getTime();
      for (
        let start = zonedToUtc(day, interval.start, timeZone).getTime();
        start + length <= end;
        start += length
      ) {
        if (start < earliest) continue;
        const overlaps = options.booked.some(
          (call) => call.startsAt.getTime() < start + length && call.endsAt.getTime() > start,
        );
        if (!overlaps) slots.push(new Date(start));
      }
    }
  }
  return slots;
}
