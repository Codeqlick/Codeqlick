/** The admin overview of the whole platform (architecture 4.17, decision 122). */

export type DiskState = 'ok' | 'low' | 'full';

/** Accounts per app: a team member, a page or room owner, a portal client. */
export type AppCounts = {
  cloud: number;
  citas: number;
  meetings: number;
  menu: number;
  portal: number;
};

export const OVERVIEW_APPS = [
  'cloud',
  'citas',
  'meetings',
  'menu',
  'portal',
] as const satisfies readonly (keyof AppCounts)[];

/** One week (Monday to Sunday, Europe/Madrid). */
export type OverviewWeek = {
  /** The Monday, `yyyy-mm-dd`. */
  start: string;
  accounts: { new: number; active: number };
  apps: AppCounts;
  /** Website purchases paid; `amountCents` as charged, VAT included. */
  purchases: { count: number; amountCents: number };
  leads: number;
  support: { opened: number; closed: number };
  deployments: number;
  siteChecks: number;
  newsletter: number;
};

export type AdminOverview = {
  generatedAt: string;
  weeks: OverviewWeek[];
  people: { accounts: number; apps: AppCounts };
  revenue: {
    currency: 'eur';
    mrrCents: number;
    cloudPro: { active: number; mrrCents: number; unpriced: number };
    maintenance: { paid: number; included: number; mrrCents: number; unpriced: number };
  };
  activity: { supportOpen: number; newsletterActive: number };
  health: {
    disk: { state: DiskState; totalBytes: number; freeBytes: number } | null;
    errors: { open: number; cspOpen: number };
    monitors: { watched: number; down: number };
  };
};

/** Each week's short axis label ("16/11") and its full date for the tables ("16 Nov 2026"). */
export function overviewWeekLabels(starts: readonly string[], locale: string) {
  const short = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'numeric',
    timeZone: 'UTC',
  });
  const long = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  return {
    labels: starts.map((start) => short.format(new Date(`${start}T00:00:00Z`))),
    longLabels: starts.map((start) => long.format(new Date(`${start}T00:00:00Z`))),
  };
}

/** Sum of a weekly figure over the weeks. */
export function sumWeeks(
  weeks: readonly OverviewWeek[],
  pick: (week: OverviewWeek) => number,
): number {
  return weeks.reduce((sum, week) => sum + pick(week), 0);
}

/** The used share of the disk, a whole percent (0 for an empty reading). */
export function diskUsedPercent(disk: { totalBytes: number; freeBytes: number }): number {
  if (disk.totalBytes <= 0) return 0;
  const used = Math.max(0, disk.totalBytes - disk.freeBytes);
  return Math.min(100, Math.round((used / disk.totalBytes) * 100));
}

/** Subscriptions whose monthly amount isn't known yet (left out of the MRR). */
export function unpricedSubscriptions(revenue: AdminOverview['revenue']): number {
  return revenue.cloudPro.unpriced + revenue.maintenance.unpriced;
}
