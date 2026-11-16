import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { CruisingInsightsService, type CruisingSpotHours } from './cruising-insights.service.js';

/** Cruising phase 5 (architecture 4.15): busiest hours and helpful reviews, for entered members. */
@ApiTags('cruising')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('cruising')
export class CruisingInsightsController {
  constructor(private readonly insights: CruisingInsightsService) {}

  @Get('spots/:id/hours')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  hours(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<CruisingSpotHours> {
    return this.insights.hours(user.id, params.id);
  }

  @Put('reviews/:id/helpful')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  markHelpful(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.insights.markHelpful(user.id, params.id);
  }

  @Delete('reviews/:id/helpful')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  unmarkHelpful(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.insights.unmarkHelpful(user.id, params.id);
  }
}
