import { Injectable, NotFoundException } from '@nestjs/common';
import { accountOf, type AuthUser } from '../../common/types/auth-user.js';
import { SiteFormsService } from '../site-forms/site-forms.service.js';
import { UmamiClient } from '../stats/umami.client.js';
import { ManagedSitesRepository } from './managed-sites.repository.js';

export interface ProjectVisits {
  /** False until the site has statistics (Umami set up and its website created). */
  enabled: boolean;
  /** False when Umami didn't answer. */
  available: boolean;
  days: number;
  visitors: number;
  pageviews: number;
  /** Messages sent through the site's form in the period. */
  messages: number;
  daily: Array<{ date: string; visitors: number; pageviews: number; messages: number }>;
  referrers: Array<{ source: string; visitors: number }>;
}

const DAY_MS = 86_400_000;

/** Visits of a managed client site (Umami) with its form's messages per day (architecture 11.6). */
@Injectable()
export class SiteVisitsService {
  constructor(
    private readonly repository: ManagedSitesRepository,
    private readonly umami: UmamiClient,
    private readonly forms: SiteFormsService,
  ) {}

  async get(
    caller: AuthUser,
    projectId: string,
    days: number,
    now = new Date(),
  ): Promise<ProjectVisits> {
    const site = await this.repository.findByProject(projectId);
    const own = site && (caller.role === 'ADMIN' || site.project.client.id === accountOf(caller));
    if (!site || !own) throw new NotFoundException('Website not found');

    const [visits, messages] = await Promise.all([
      site.umamiWebsiteId ? this.umami.visits(days, now.getTime(), site.umamiWebsiteId) : undefined,
      this.forms.messagesByDay(projectId, new Date(now.getTime() - days * DAY_MS)),
    ]);
    const daily =
      visits?.daily.map((day) => ({
        date: day.date,
        visitors: day.visitors,
        pageviews: day.pageviews,
        messages: messages.get(day.date) ?? 0,
      })) ?? [];
    return {
      enabled: Boolean(visits?.enabled),
      available: Boolean(visits?.available),
      days,
      visitors: visits?.totals.visitors ?? 0,
      pageviews: visits?.totals.pageviews ?? 0,
      messages: [...messages.values()].reduce((sum, count) => sum + count, 0),
      daily,
      referrers: (visits?.referrers ?? []).slice(0, 5),
    };
  }
}
