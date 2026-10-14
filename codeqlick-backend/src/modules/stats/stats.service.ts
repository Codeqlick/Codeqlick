import { Injectable } from '@nestjs/common';
import { StatsRepository } from './stats.repository.js';

export interface AdminStats {
  leads: { new: number; total: number };
  posts: { published: number; drafts: number; scheduled: number };
  portfolio: { published: number };
  projects: { active: number };
  clients: number;
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
}
