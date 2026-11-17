import type { DiskReading } from '../../common/disk-space.js';
import type { OverviewTotalsRow, OverviewWeekRow } from './admin-overview.repository.js';

/** The admin overview's shape and how it is put together (architecture 4.17, decision 122). */

/** Accounts per app: entered (a profile), a team member, a page or room owner, a portal client. */
export interface AppCounts {
  cruising: number;
  swipe: number;
  videochat: number;
  cloud: number;
  citas: number;
  meetings: number;
  portal: number;
}

/** One week (Monday to Sunday, Europe/Madrid). */
export interface OverviewWeek {
  /** The Monday, `yyyy-mm-dd`. */
  start: string;
  accounts: { new: number; active: number };
  /** New per app that week. */
  apps: AppCounts;
  /** Website purchases paid that week; `amountCents` as charged, VAT included. */
  purchases: { count: number; amountCents: number };
  leads: number;
  support: { opened: number; closed: number };
  deployments: number;
  siteChecks: number;
  /** Newsletter sign-ups confirmed. */
  newsletter: number;
}

export interface AdminOverview {
  generatedAt: string;
  weeks: OverviewWeek[];
  /** `neoqlickAccounts`: the 18+ apps' own accounts (architecture 4.18); `accounts` are Codeqlick's. */
  people: { accounts: number; neoqlickAccounts: number; apps: AppCounts };
  revenue: {
    currency: 'eur';
    /** Cloud PRO's and the maintenance plans', a month before VAT. */
    mrrCents: number;
    cloudPro: { active: number; mrrCents: number; unpriced: number };
    maintenance: { paid: number; included: number; mrrCents: number; unpriced: number };
  };
  activity: { supportOpen: number; newsletterActive: number };
  health: {
    disk: { state: DiskReading['state']; totalBytes: number; freeBytes: number } | null;
    errors: { open: number; cspOpen: number };
    monitors: { watched: number; down: number };
    moderation: {
      cruising: {
        spots: number;
        reports: number;
        media: number;
        verifications: number;
        takedowns: number;
      };
      swipe: { photos: number; reports: number; verifications: number; takedowns: number };
      videochat: { reports: number; appeals: number; verifications: number };
    };
  };
}

const APPS = ['cruising', 'swipe', 'videochat', 'cloud', 'citas', 'meetings', 'portal'] as const;

type Counter = 'leads' | 'deployments' | 'siteChecks' | 'newsletter';
const COUNTERS: Record<string, Counter> = {
  leads: 'leads',
  deployments: 'deployments',
  siteChecks: 'siteChecks',
  newsletter: 'newsletter',
};

function emptyApps(): AppCounts {
  return { cruising: 0, swipe: 0, videochat: 0, cloud: 0, citas: 0, meetings: 0, portal: 0 };
}

export function emptyWeek(start: string): OverviewWeek {
  return {
    start,
    accounts: { new: 0, active: 0 },
    apps: emptyApps(),
    purchases: { count: 0, amountCents: 0 },
    leads: 0,
    support: { opened: 0, closed: 0 },
    deployments: 0,
    siteChecks: 0,
    newsletter: 0,
  };
}

const isApp = (metric: string): metric is (typeof APPS)[number] =>
  (APPS as readonly string[]).includes(metric);

/**
 * Puts the weekly rows into the weeks `starts` (every week present, zeros included; rows of any
 * other week are left out) and the totals into the answer.
 */
export function buildOverview(input: {
  starts: readonly string[];
  weeks: readonly OverviewWeekRow[];
  active: readonly { week: string; total: number }[];
  totals: OverviewTotalsRow;
  disk: DiskReading | null;
  now: Date;
}): AdminOverview {
  const { totals: t } = input;
  const weeks = new Map(input.starts.map((start) => [start, emptyWeek(start)]));
  for (const row of input.weeks) {
    const week = weeks.get(row.week);
    if (!week) continue;
    const counter = COUNTERS[row.metric];
    if (counter) week[counter] += row.total;
    else if (isApp(row.metric)) week.apps[row.metric] += row.total;
    else if (row.metric === 'accounts') week.accounts.new += row.total;
    else if (row.metric === 'supportOpened') week.support.opened += row.total;
    else if (row.metric === 'supportClosed') week.support.closed += row.total;
    else if (row.metric === 'purchases') {
      week.purchases.count += row.total;
      week.purchases.amountCents += Math.round(row.amount);
    }
  }
  for (const row of input.active) {
    const week = weeks.get(row.week);
    if (week) week.accounts.active = row.total;
  }

  const cloudProMrr = Math.round(t.cloudProMrr);
  const maintenanceMrr = Math.round(t.maintenanceMrr);
  return {
    generatedAt: input.now.toISOString(),
    weeks: [...weeks.values()],
    people: {
      accounts: t.accounts,
      neoqlickAccounts: t.neoqlickAccounts,
      apps: {
        cruising: t.cruising,
        swipe: t.swipe,
        videochat: t.videochat,
        cloud: t.cloud,
        citas: t.citas,
        meetings: t.meetings,
        portal: t.portal,
      },
    },
    revenue: {
      currency: 'eur',
      mrrCents: cloudProMrr + maintenanceMrr,
      cloudPro: { active: t.cloudProActive, mrrCents: cloudProMrr, unpriced: t.cloudProUnpriced },
      maintenance: {
        paid: t.maintenancePaid,
        included: t.maintenanceIncluded,
        mrrCents: maintenanceMrr,
        unpriced: t.maintenanceUnpriced,
      },
    },
    activity: { supportOpen: t.supportOpen, newsletterActive: t.newsletterActive },
    health: {
      disk: input.disk
        ? {
            state: input.disk.state,
            totalBytes: input.disk.totalBytes,
            freeBytes: input.disk.freeBytes,
          }
        : null,
      errors: { open: t.errorsOpen, cspOpen: t.cspOpen },
      monitors: { watched: t.monitorsWatched, down: t.monitorsDown },
      moderation: {
        cruising: {
          spots: t.cruisingSpots,
          reports: t.cruisingReports,
          media: t.cruisingMedia,
          verifications: t.cruisingVerifications,
          takedowns: t.cruisingTakedowns,
        },
        swipe: {
          photos: t.swipePhotos,
          reports: t.swipeReports,
          verifications: t.swipeVerifications,
          takedowns: t.swipeTakedowns,
        },
        videochat: {
          reports: t.videochatReports,
          appeals: t.videochatAppeals,
          verifications: t.videochatVerifications,
        },
      },
    },
  };
}
