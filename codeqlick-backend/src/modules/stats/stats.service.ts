import { Injectable } from '@nestjs/common';
import { SITE_TIME_ZONE, StatsRepository, type MonthlyCounts } from './stats.repository.js';

export interface AdminStats {
  leads: { new: number; total: number };
  posts: { published: number; drafts: number; scheduled: number };
  portfolio: { published: number };
  projects: { active: number };
  clients: number;
}

export interface AdminTimeline {
  /** Oldest first, one entry per month (zeros included), the current month last. */
  months: MonthlyCounts[];
}

/** The last `count` months as `yyyy-mm` in the studio's time zone, oldest first. */
export function lastMonths(count: number, now = new Date()): string[] {
  const [year = 0, month = 1] = new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  })
    .format(now)
    .split('-')
    .map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

@Injectable()
export class StatsService {
  constructor(private readonly repository: StatsRepository) {}

  async get(): Promise<AdminStats> {
    const c = await this.repository.counts();
    return {
      leads: { new: c.leadsNew, total: c.leadsTotal },
      posts: { published: c.postsPublished, drafts: c.postsDrafts, scheduled: c.postsScheduled },
      portfolio: { published: c.portfolioPublished },
      projects: { active: c.projectsActive },
      clients: c.clients,
    };
  }

  async timeline(months: number, now = new Date()): Promise<AdminTimeline> {
    const keys = lastMonths(months, now);
    // A day early: rows are bucketed by Madrid month, which starts up to two hours before UTC.
    const since = new Date(`${keys[0]}-01T00:00:00Z`);
    since.setUTCDate(since.getUTCDate() - 1);
    const counts = new Map((await this.repository.monthly(since)).map((row) => [row.month, row]));
    return {
      months: keys.map(
        (month) => counts.get(month) ?? { month, leads: 0, leadsWon: 0, posts: 0, caseStudies: 0 },
      ),
    };
  }
}
