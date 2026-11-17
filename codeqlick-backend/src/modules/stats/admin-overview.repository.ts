import { Injectable } from '@nestjs/common';
import { STATS_TIME_ZONE } from '../../common/stats-weeks.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** A weekly count: `metric` (see the query), the week's Monday, how many and their amount. */
export interface OverviewWeekRow {
  metric: string;
  week: string;
  total: number;
  /** Cents (purchases only; 0 for the rest). */
  amount: number;
}

/** Everything counted "now", one row (see the query for each column). */
export interface OverviewTotalsRow {
  accounts: number;
  /** NEOQLICK accounts (architecture 4.18); `accounts` counts CODEQLICK ones. */
  neoqlickAccounts: number;
  cruising: number;
  swipe: number;
  videochat: number;
  cloud: number;
  citas: number;
  meetings: number;
  portal: number;
  cloudProActive: number;
  cloudProMrr: number;
  cloudProUnpriced: number;
  maintenancePaid: number;
  maintenanceIncluded: number;
  maintenanceMrr: number;
  maintenanceUnpriced: number;
  supportOpen: number;
  newsletterActive: number;
  errorsOpen: number;
  cspOpen: number;
  monitorsWatched: number;
  monitorsDown: number;
  cruisingSpots: number;
  cruisingReports: number;
  cruisingMedia: number;
  cruisingVerifications: number;
  cruisingTakedowns: number;
  swipePhotos: number;
  swipeReports: number;
  swipeVerifications: number;
  swipeTakedowns: number;
  videochatReports: number;
  videochatAppeals: number;
  videochatVerifications: number;
}

/**
 * The admin overview's aggregates (architecture 4.17, decision 122), counted in SQL by Madrid week
 * (Monday) with tagged templates only (every value a bound parameter). Nothing here returns a
 * person: only counts and sums.
 *
 * "People" are CODEQLICK accounts with role CLIENT (the team's ADMIN accounts are left out);
 * NEOQLICK accounts are counted apart (`neoqlickAccounts`), and the 18+ apps' figures count the
 * profiles of either realm (after the cut-over only NEOQLICK accounts have any). A portal client
 * is `CLIENT_WHERE` of `users/account-kind.ts` (decision 29) written in SQL, and active, like the
 * dashboard's "clients"; an e2e test checks both agree.
 */
@Injectable()
export class AdminOverviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The weekly figures from the Monday `from` (`yyyy-mm-dd`, Madrid) on, and the totals now. */
  async overview(from: string) {
    const tz = STATS_TIME_ZONE;
    const [weeks, active, totals] = await this.prisma.$transaction([
      this.prisma.$queryRaw<OverviewWeekRow[]>`
        WITH bounds AS (SELECT (${from}::date)::timestamp AT TIME ZONE ${tz} AS since),
        people AS (SELECT id, created_at FROM users WHERE role = 'CLIENT' AND realm = 'CODEQLICK'),
        everyone AS (SELECT id FROM users WHERE role = 'CLIENT'),
        portal AS (
          SELECT u.id, u.created_at FROM users u
          WHERE u.role = 'CLIENT' AND u.realm = 'CODEQLICK' AND u.is_active
            AND (
              u.registered_at IS NULL
              OR u.member_of_id IS NOT NULL
              OR EXISTS (SELECT 1 FROM users m WHERE m.member_of_id = u.id)
              OR EXISTS (SELECT 1 FROM client_projects p WHERE p.client_id = u.id)
              OR EXISTS (SELECT 1 FROM proposals p WHERE p.client_id = u.id)
              OR EXISTS (SELECT 1 FROM support_tickets t WHERE t.client_id = u.id)
              OR EXISTS (SELECT 1 FROM leads l WHERE l.client_id = u.id)
            )
        ),
        events AS (
          SELECT 'accounts' AS metric, created_at AS at, 0 AS amount FROM people
          UNION ALL SELECT 'cruising', c.created_at, 0
            FROM cruising_profiles c JOIN everyone ON everyone.id = c.user_id
          UNION ALL SELECT 'swipe', s.created_at, 0
            FROM swipe_profiles s JOIN everyone ON everyone.id = s.user_id
          UNION ALL SELECT 'videochat', v.created_at, 0
            FROM videochat_profiles v JOIN everyone ON everyone.id = v.user_id
          UNION ALL SELECT 'cloud', min(m.created_at), 0
            FROM cloud_members m JOIN people ON people.id = m.user_id GROUP BY m.user_id
          UNION ALL SELECT 'citas', min(b.created_at), 0
            FROM booking_pages b JOIN people ON people.id = b.owner_id GROUP BY b.owner_id
          UNION ALL SELECT 'meetings', min(r.created_at), 0
            FROM meeting_rooms r JOIN people ON people.id = r.owner_id GROUP BY r.owner_id
          UNION ALL SELECT 'portal', created_at, 0 FROM portal
          UNION ALL SELECT 'purchases', paid_at, amount_cents
            FROM site_purchases WHERE status = 'PAID' AND paid_at IS NOT NULL
          UNION ALL SELECT 'leads', created_at, 0 FROM leads
          UNION ALL SELECT 'supportOpened', created_at, 0 FROM support_tickets
          UNION ALL SELECT 'supportClosed', resolved_at, 0 FROM support_tickets
            WHERE status IN ('RESOLVED', 'CLOSED') AND resolved_at IS NOT NULL
          UNION ALL SELECT 'deployments', created_at, 0 FROM cloud_deployments
          UNION ALL SELECT 'siteChecks', created_at, 0 FROM site_audits
          UNION ALL SELECT 'newsletter', confirmed_at, 0 FROM newsletter_subscribers
            WHERE confirmed_at IS NOT NULL
        )
        SELECT metric,
               to_char(date_trunc('week', at AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS week,
               count(*)::int AS total,
               coalesce(sum(amount), 0)::float8 AS amount
        FROM events, bounds
        WHERE at >= bounds.since
        GROUP BY 1, 2`,
      this.prisma.$queryRaw<{ week: string; total: number }[]>`
        SELECT to_char(date_trunc('week', s.created_at AT TIME ZONE ${tz}), 'YYYY-MM-DD') AS week,
               count(DISTINCT s.user_id)::int AS total
        FROM sessions s
        JOIN users u ON u.id = s.user_id AND u.role = 'CLIENT' AND u.realm = 'CODEQLICK'
        WHERE s.created_at >= (${from}::date)::timestamp AT TIME ZONE ${tz}
        GROUP BY 1`,
      this.prisma.$queryRaw<OverviewTotalsRow[]>`
        WITH people AS (SELECT id FROM users WHERE role = 'CLIENT' AND realm = 'CODEQLICK'),
        everyone AS (SELECT id FROM users WHERE role = 'CLIENT'),
        pro AS (
          SELECT subscription_amount_cents AS amount FROM cloud_teams
          WHERE subscription_status IN ('active', 'trialing', 'past_due')
        ),
        maintenance AS (
          SELECT maintenance_amount_cents AS amount FROM client_projects
          WHERE maintenance_status IN ('ACTIVE', 'PAST_DUE')
            AND maintenance_included_reason IS NULL
        )
        SELECT
          (SELECT count(*) FROM people)::int AS accounts,
          (SELECT count(*) FROM users WHERE role = 'CLIENT' AND realm = 'NEOQLICK')::int
            AS "neoqlickAccounts",
          (SELECT count(*) FROM cruising_profiles c JOIN everyone ON everyone.id = c.user_id)::int
            AS cruising,
          (SELECT count(*) FROM swipe_profiles s JOIN everyone ON everyone.id = s.user_id)::int
            AS swipe,
          (SELECT count(*) FROM videochat_profiles v JOIN everyone ON everyone.id = v.user_id)::int
            AS videochat,
          (SELECT count(DISTINCT m.user_id) FROM cloud_members m
            JOIN people ON people.id = m.user_id)::int AS cloud,
          (SELECT count(DISTINCT b.owner_id) FROM booking_pages b
            JOIN people ON people.id = b.owner_id)::int AS citas,
          (SELECT count(DISTINCT r.owner_id) FROM meeting_rooms r
            JOIN people ON people.id = r.owner_id)::int AS meetings,
          (SELECT count(*) FROM users u
            WHERE u.role = 'CLIENT' AND u.realm = 'CODEQLICK' AND u.is_active
              AND (
                u.registered_at IS NULL
                OR u.member_of_id IS NOT NULL
                OR EXISTS (SELECT 1 FROM users m WHERE m.member_of_id = u.id)
                OR EXISTS (SELECT 1 FROM client_projects p WHERE p.client_id = u.id)
                OR EXISTS (SELECT 1 FROM proposals p WHERE p.client_id = u.id)
                OR EXISTS (SELECT 1 FROM support_tickets t WHERE t.client_id = u.id)
                OR EXISTS (SELECT 1 FROM leads l WHERE l.client_id = u.id)
              ))::int AS portal,
          (SELECT count(*) FROM pro)::int AS "cloudProActive",
          (SELECT coalesce(sum(amount), 0) FROM pro)::float8 AS "cloudProMrr",
          (SELECT count(*) FROM pro WHERE amount IS NULL)::int AS "cloudProUnpriced",
          (SELECT count(*) FROM maintenance)::int AS "maintenancePaid",
          (SELECT count(*) FROM client_projects
            WHERE maintenance_included_reason IS NOT NULL)::int AS "maintenanceIncluded",
          (SELECT coalesce(sum(amount), 0) FROM maintenance)::float8 AS "maintenanceMrr",
          (SELECT count(*) FROM maintenance WHERE amount IS NULL)::int AS "maintenanceUnpriced",
          (SELECT count(*) FROM support_tickets
            WHERE status IN ('OPEN', 'IN_PROGRESS', 'WAITING_CLIENT'))::int AS "supportOpen",
          (SELECT count(*) FROM newsletter_subscribers WHERE status = 'ACTIVE')::int
            AS "newsletterActive",
          (SELECT count(*) FROM error_groups WHERE resolved_at IS NULL AND source <> 'CSP')::int
            AS "errorsOpen",
          (SELECT count(*) FROM error_groups WHERE resolved_at IS NULL AND source = 'CSP')::int
            AS "cspOpen",
          (SELECT count(*) FROM site_monitors WHERE enabled)::int AS "monitorsWatched",
          (SELECT count(*) FROM site_monitors WHERE enabled AND status = 'DOWN')::int
            AS "monitorsDown",
          (SELECT count(*) FROM cruising_spots WHERE status = 'PENDING')::int AS "cruisingSpots",
          (SELECT count(*) FROM cruising_reports WHERE status = 'OPEN')::int AS "cruisingReports",
          (SELECT count(*) FROM cruising_media
            WHERE reviewed_at IS NULL AND status IN ('LIVE', 'HIDDEN', 'PROCESSING'))::int
            AS "cruisingMedia",
          (SELECT count(*) FROM cruising_profiles WHERE verification_status = 'PENDING')::int
            AS "cruisingVerifications",
          (SELECT count(*) FROM cruising_takedowns WHERE status = 'OPEN')::int
            AS "cruisingTakedowns",
          (SELECT count(*) FROM swipe_photos WHERE status = 'PENDING')::int AS "swipePhotos",
          (SELECT count(*) FROM swipe_reports WHERE status = 'OPEN')::int AS "swipeReports",
          (SELECT count(*) FROM swipe_profiles WHERE verification_status = 'PENDING')::int
            AS "swipeVerifications",
          (SELECT count(*) FROM swipe_takedowns WHERE status = 'OPEN')::int AS "swipeTakedowns",
          (SELECT count(*) FROM videochat_reports WHERE status = 'OPEN')::int
            AS "videochatReports",
          (SELECT count(*) FROM videochat_appeals WHERE status = 'OPEN')::int
            AS "videochatAppeals",
          (SELECT count(*) FROM videochat_profiles WHERE verification_status = 'PENDING')::int
            AS "videochatVerifications"`,
    ]);
    return { weeks, active, totals: totals[0]! };
  }
}
