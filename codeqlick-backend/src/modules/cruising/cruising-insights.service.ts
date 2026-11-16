import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CruisingProfile } from '../../generated/prisma/client.js';
import { emptyWeek, HOURS_READY_AFTER, scaleWeek } from './cruising-insights.rules.js';
import { CruisingRepository } from './cruising.repository.js';
import { isSuspended } from './cruising.rules.js';

/** A spot's busiest hours: `days[day][hour]` (0 = Monday), 0-100 against the busiest hour. */
export interface CruisingSpotHours {
  /** False until 10 check-ins were counted at the spot: `days` is then all zeros. */
  ready: boolean;
  days: number[][];
}

/**
 * Cruising phase 5 (architecture 4.15): a spot's busiest hours (decision 89) and helpful votes on
 * reviews (decision 93). Only for members who have entered.
 */
@Injectable()
export class CruisingInsightsService {
  constructor(
    private readonly repository: CruisingRepository,
    private readonly config: AppConfigService,
  ) {}

  /** A member who has entered with the current rules (a suspended one can still read). */
  private async entered(userId: string): Promise<CruisingProfile> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || profile.termsVersion !== this.config.cruisingTermsVersion) {
      throw new ForbiddenException('Confirm your age and accept the rules first');
    }
    return profile;
  }

  /** The week chart of a LIVE spot, once 10 check-ins were counted there. */
  async hours(userId: string, spotId: string): Promise<CruisingSpotHours> {
    await this.entered(userId);
    const spot = await this.repository.findSpot(spotId);
    if (!spot || spot.status !== 'LIVE') throw new NotFoundException('Spot not found');
    const { rows, checkIns } = await this.repository.spotHours(spot.id);
    if (checkIns < HOURS_READY_AFTER) return { ready: false, days: emptyWeek() };
    return { ready: true, days: scaleWeek(rows) };
  }

  /** A LIVE review of a LIVE spot that the member may vote on: not theirs, nobody blocked. */
  private async votable(userId: string, reviewId: string) {
    const review = await this.repository.findReviewById(reviewId);
    if (!review || review.status !== 'LIVE' || review.spot.status !== 'LIVE') {
      throw new NotFoundException('Review not found');
    }
    if (review.userId === userId) {
      throw new BadRequestException('You cannot mark your own review as helpful');
    }
    if ((await this.repository.hiddenIds(userId)).includes(review.userId)) {
      throw new NotFoundException('Review not found');
    }
    return review;
  }

  /** "Helpful": one vote per member and review (marking it again changes nothing). */
  async markHelpful(userId: string, reviewId: string, now = new Date()): Promise<void> {
    const me = await this.entered(userId);
    if (isSuspended(me, now)) throw new ForbiddenException('Your account is suspended');
    const review = await this.votable(userId, reviewId);
    await this.repository.addHelpfulVote(review.id, userId, review.userId, now);
  }

  /** Takes my "helpful" back (none given is fine). */
  async unmarkHelpful(userId: string, reviewId: string): Promise<void> {
    await this.entered(userId);
    const review = await this.repository.findReviewById(reviewId);
    if (!review) throw new NotFoundException('Review not found');
    await this.repository.removeHelpfulVote(review.id, userId, review.userId);
  }
}
