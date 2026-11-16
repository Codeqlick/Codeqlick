import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { CruisingStatsRepository } from './cruising-stats.repository.js';
import { isGridBbox, SUGGESTIONS_LIMIT } from './cruising-stats.rules.js';
import type { Bbox } from './cruising.rules.js';
import { CruisingRepository } from './cruising.repository.js';
import { spotSummary, type CruisingSpotSummary } from './cruising.service.js';

/**
 * Cruising's onboarding (architecture 4.15, decision 102): the spots suggested to save as
 * favourites. Whether the tour is done is the profile's `onboardingDone` (PATCH /cruising/profile).
 */
@Injectable()
export class CruisingOnboardingService {
  constructor(
    private readonly repository: CruisingRepository,
    private readonly stats: CruisingStatsRepository,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Up to 12 LIVE spots, the best rated and most active: near the map's last view (a box on the
   * 0.25° grid, so it says no more than the map's own requests) or else in my country.
   */
  async suggestions(userId: string, box?: Bbox): Promise<{ items: CruisingSpotSummary[] }> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || profile.termsVersion !== this.config.cruisingTermsVersion) {
      throw new ForbiddenException('Confirm your age and accept the rules first');
    }
    if (box && !isGridBbox(box)) {
      throw new BadRequestException('bbox must be on the 0.25° grid');
    }
    const spots = await this.stats.suggestions(
      box ? { box } : { country: profile.country ?? undefined },
      SUGGESTIONS_LIMIT,
    );
    return { items: spots.map((spot) => spotSummary(spot)) };
  }
}
