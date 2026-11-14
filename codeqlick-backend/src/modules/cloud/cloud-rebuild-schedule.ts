import { addDays, madridDay, madridToUtc, WEEKDAYS, weekdayOf } from '../bookings/booking-time.js';
import type { CloudRebuildFrequency } from '../../generated/prisma/client.js';

/** Scheduled builds failing in a row that switch the schedule off (architecture 4.13). */
export const REBUILD_MAX_FAILURES = 5;

export interface RebuildSchedule {
  frequency: CloudRebuildFrequency;
  /** 0–59. */
  minute: number | null;
  /** 0–23, Madrid time. */
  hour: number | null;
  /** 1–7, Monday first. */
  weekday: number | null;
}

const HOUR_MS = 3_600_000;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The first run of a schedule strictly after `after` (Madrid time, decision 65), or null when it
 * is off. Hourly runs every real hour at its minute (Madrid is a whole number of hours from UTC,
 * so the minute is the same in both). Daily and weekly runs are at a Madrid wall-clock time: on
 * the day the clocks go forward a time that doesn't exist runs an hour later, and on the day they
 * go back a time that happens twice runs once (the second time).
 */
export function nextRebuild(schedule: RebuildSchedule, after: Date): Date | null {
  const minute = schedule.minute ?? 0;
  if (schedule.frequency === 'OFF') return null;
  if (schedule.frequency === 'HOURLY') {
    const hourStart = Math.floor(after.getTime() / HOUR_MS) * HOUR_MS;
    let next = hourStart + minute * 60_000;
    if (next <= after.getTime()) next += HOUR_MS;
    return new Date(next);
  }
  const time = `${pad(schedule.hour ?? 0)}:${pad(minute)}`;
  const today = madridDay(after);
  // A week and a day covers every weekday even when today's time has passed.
  for (let i = 0; i <= 7; i++) {
    const day = addDays(today, i);
    if (
      schedule.frequency === 'WEEKLY' &&
      WEEKDAYS.indexOf(weekdayOf(day)) + 1 !== schedule.weekday
    )
      continue;
    const at = madridToUtc(day, time);
    if (at.getTime() > after.getTime()) return at;
  }
  return null;
}

export interface RebuildView {
  frequency: 'off' | 'hourly' | 'daily' | 'weekly';
  minute: number | null;
  hour: number | null;
  weekday: number | null;
  nextAt: string | null;
  failures: number;
}

/** A project's schedule as the API shows it. */
export function rebuildView(project: {
  rebuildFrequency: CloudRebuildFrequency;
  rebuildMinute: number | null;
  rebuildHour: number | null;
  rebuildWeekday: number | null;
  rebuildNextAt: Date | null;
  rebuildFailures: number;
}): RebuildView {
  return {
    frequency: project.rebuildFrequency.toLowerCase() as RebuildView['frequency'],
    minute: project.rebuildMinute,
    hour: project.rebuildHour,
    weekday: project.rebuildWeekday,
    nextAt: project.rebuildNextAt?.toISOString() ?? null,
    failures: project.rebuildFailures,
  };
}
