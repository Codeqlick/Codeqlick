/** Uptime figures from the stored checks, by Madrid day. */

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' });

export type DayUptime = {
  /** `yyyy-mm-dd` (Madrid). */
  day: string;
  checks: number;
  /** 0–1, or null without checks that day. */
  ratio: number | null;
};

/** The last `days` days, oldest first, today included. */
export function dailyUptime(
  checks: { checkedAt: Date; ok: boolean }[],
  days: number,
  now: Date,
): DayUptime[] {
  const totals = new Map<string, { checks: number; ok: number }>();
  for (const check of checks) {
    const key = dayKey.format(check.checkedAt);
    const entry = totals.get(key) ?? { checks: 0, ok: 0 };
    entry.checks += 1;
    if (check.ok) entry.ok += 1;
    totals.set(key, entry);
  }
  const today = dayKey.format(now);
  const result: DayUptime[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - offset);
    const day = date.toISOString().slice(0, 10);
    const entry = totals.get(day);
    result.push({ day, checks: entry?.checks ?? 0, ratio: entry ? entry.ok / entry.checks : null });
  }
  return result;
}

/** Share of successful checks, or null without checks. */
export function uptimeRatio(checks: { ok: boolean }[]): number | null {
  if (checks.length === 0) return null;
  return checks.filter((check) => check.ok).length / checks.length;
}
