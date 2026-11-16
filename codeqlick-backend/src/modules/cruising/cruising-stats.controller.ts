import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { suggestionsQuerySchema, type SuggestionsQuery } from './cruising-onboarding.schemas.js';
import { CruisingOnboardingService } from './cruising-onboarding.service.js';
import { CruisingStatsService, type CruisingStats } from './cruising-stats.service.js';
import type { CruisingSpotSummary } from './cruising.service.js';

/** Cruising phase 6 (architecture 4.15): the onboarding's suggested spots (decision 102). */
@ApiTags('cruising')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('cruising')
export class CruisingOnboardingController {
  constructor(private readonly onboarding: CruisingOnboardingService) {}

  @Get('suggestions')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  suggestions(
    @CurrentUser() user: AuthUser,
    @Query({ schema: suggestionsQuerySchema }) query: SuggestionsQuery,
  ): Promise<{ items: CruisingSpotSummary[] }> {
    return this.onboarding.suggestions(user.id, query.bbox);
  }
}

/** Cruising's statistics for the team (decision 101): aggregates only, cached 10 minutes. */
@ApiTags('admin: cruising')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/cruising')
export class CruisingStatsAdminController {
  constructor(private readonly statistics: CruisingStatsService) {}

  @Get('stats')
  stats(): Promise<CruisingStats> {
    return this.statistics.stats();
  }
}
