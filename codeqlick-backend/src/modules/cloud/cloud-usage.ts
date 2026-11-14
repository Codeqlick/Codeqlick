import type { CloudLimits } from './cloud-plans.js';

/** A limit counts as reached at this percent of it (architecture 4.13 "Usage alerts"). */
export const CLOUD_USAGE_ALERT_PERCENT = 80;

export const METER_KEYS = [
  'builds',
  'formSubmissions',
  'analyticsEvents',
  'storage',
  'deploymentsPerHour',
] as const;
export type MeterKey = (typeof METER_KEYS)[number];

export interface Meter {
  key: MeterKey;
  used: number;
  limit: number;
  percent: number;
}

/** What a team has used of each measure, before it is set against the plan. */
export type MeterUsage = Record<MeterKey, number>;

/** The plan's limit behind each measure. */
const LIMIT_OF: Record<MeterKey, keyof CloudLimits> = {
  builds: 'buildsPerMonth',
  formSubmissions: 'formSubmissionsPerMonth',
  analyticsEvents: 'analyticsEventsPerMonth',
  storage: 'storageBytesPerTeam',
  deploymentsPerHour: 'deploymentsPerHour',
};

/** `floor(used / limit × 100)`; it can pass 100. A limit of 0 counts as full. */
export function meterPercent(used: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.floor((used * 100) / limit);
}

/** Whether `used` is at or over the alert threshold of `limit`: `used × 100 ≥ limit × 80`. */
export function reachesThreshold(used: number, limit: number): boolean {
  return used * 100 >= limit * CLOUD_USAGE_ALERT_PERCENT;
}

/** The five measures of a team against its plan's limits. */
export function buildMeters(limits: CloudLimits, usage: MeterUsage): Meter[] {
  return METER_KEYS.map((key) => {
    const limit = limits[LIMIT_OF[key]];
    return { key, used: usage[key], limit, percent: meterPercent(usage[key], limit) };
  });
}

/** The measures that call for an alert (a limit of 0 or less is not a limit). */
export function crossing(meters: Meter[]): Meter[] {
  return meters.filter((meter) => meter.limit > 0 && reachesThreshold(meter.used, meter.limit));
}
