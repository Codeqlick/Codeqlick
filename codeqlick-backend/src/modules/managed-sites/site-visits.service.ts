import { Injectable, NotFoundException } from '@nestjs/common';
import { accountOf, type AuthUser } from '../../common/types/auth-user.js';
import type { Paginated } from '../../common/types/paginated.js';
import { SiteFormsService, type KeptMessage } from '../site-forms/site-forms.service.js';
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

/**
 * Visits of a managed client site (Umami) with its form's messages per day, and the messages its
 * form kept (architecture 8.2, decision 31).
 */
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
    const site = await this.ownSite(caller, projectId);

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

  /** The messages the site's form kept, newest first. */
  async messages(
    caller: AuthUser,
    projectId: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<KeptMessage>> {
    await this.ownSite(caller, projectId);
    return this.forms.messages(projectId, page, pageSize);
  }

  async deleteMessage(caller: AuthUser, projectId: string, messageId: string): Promise<void> {
    await this.ownSite(caller, projectId);
    await this.forms.deleteMessage(projectId, messageId);
  }

  private async ownSite(caller: AuthUser, projectId: string) {
    const site = await this.repository.findByProject(projectId);
    const own = site && (caller.role === 'ADMIN' || site.project.client.id === accountOf(caller));
    if (!site || !own) throw new NotFoundException('Website not found');
    return site;
  }
}
