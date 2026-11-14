import { Injectable } from '@nestjs/common';
import { deployBadgeState, deployBadgeSvg, type DeployBadgeState } from './cloud-badge.js';
import { CloudRepository } from './cloud.repository.js';

/** How long a badge is reused before the database is asked again. */
export const BADGE_TTL_MS = 60_000;
/** Most slugs kept in the cache, so requests for made-up slugs can't grow it without end. */
const BADGE_CACHE_MAX = 1000;

/** Projects' README badges (architecture 4.13 "Status badge"). Public and cached. */
@Injectable()
export class CloudBadgesService {
  private readonly cache = new Map<string, { at: number; state: DeployBadgeState }>();

  constructor(private readonly repository: CloudRepository) {}

  async deployBadge(slug: string, now = Date.now()): Promise<string> {
    return deployBadgeSvg(await this.state(slug, now));
  }

  private async state(slug: string, now: number): Promise<DeployBadgeState> {
    const cached = this.cache.get(slug);
    if (cached && now - cached.at < BADGE_TTL_MS) return cached.state;
    const state = deployBadgeState(await this.repository.findBadgeFacts(slug));
    if (this.cache.size >= BADGE_CACHE_MAX) {
      for (const [key, entry] of this.cache) {
        if (now - entry.at >= BADGE_TTL_MS) this.cache.delete(key);
      }
      if (this.cache.size >= BADGE_CACHE_MAX) this.cache.clear();
    }
    this.cache.set(slug, { at: now, state });
    return state;
  }
}
