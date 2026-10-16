import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { SiteVisitsService, type ProjectVisits } from './site-visits.service.js';

const daysQuerySchema = z.object({
  days: z.enum(['7', '30', '90']).default('30').transform(Number),
});

@ApiTags('portal/site')
@ApiBearerAuth()
@Controller()
export class SiteVisitsController {
  constructor(private readonly visits: SiteVisitsService) {}

  @Roles('CLIENT', 'ADMIN')
  @Get('portal/projects/:id/visits')
  forClient(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: daysQuerySchema }) query: { days: number },
  ): Promise<ProjectVisits> {
    return this.visits.get(user, params.id, query.days);
  }

  @Roles('ADMIN')
  @Get('admin/projects/:id/visits')
  forTeam(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: daysQuerySchema }) query: { days: number },
  ): Promise<ProjectVisits> {
    return this.visits.get(user, params.id, query.days);
  }
}
