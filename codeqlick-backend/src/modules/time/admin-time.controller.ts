import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  createTimeEntrySchema,
  planSchema,
  timeEntryParamSchema,
  timeMonthQuerySchema,
  type CreateTimeEntryInput,
  type PlanInput,
  type TimeEntryParam,
  type TimeMonthQuery,
} from './time.schemas.js';
import {
  TimeService,
  type MonthTime,
  type ProjectTime,
  type TimeEntryView,
} from './time.service.js';
import { PlansService, type PlanView } from './plans.service.js';

@ApiTags('admin/time')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminTimeController {
  constructor(
    private readonly time: TimeService,
    private readonly plans: PlansService,
  ) {}

  @Get('time')
  month(@Query({ schema: timeMonthQuerySchema }) query: TimeMonthQuery): Promise<MonthTime> {
    return this.time.month(query.month);
  }

  @Get('plans')
  plansOverview(@Query({ schema: timeMonthQuerySchema }) query: TimeMonthQuery) {
    return this.plans.overview(query.month);
  }

  @Get('projects/:id/plan')
  async plan(
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<PlanView | { active: false }> {
    return (await this.plans.get(params.id)) ?? { active: false };
  }

  @Put('projects/:id/plan')
  savePlan(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: planSchema }) body: PlanInput,
  ): Promise<PlanView> {
    return this.plans.save(user, params.id, body);
  }

  @Get('projects/:id/time')
  forProject(@Param({ schema: idParamSchema }) params: IdParam): Promise<ProjectTime> {
    return this.time.forProject(params.id);
  }

  @Post('projects/:id/time')
  log(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createTimeEntrySchema }) body: CreateTimeEntryInput,
  ): Promise<TimeEntryView> {
    return this.time.log(user, params.id, body);
  }

  @Delete('projects/:id/time/:entryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param({ schema: timeEntryParamSchema }) params: TimeEntryParam,
  ): Promise<void> {
    await this.time.remove(user, params.id, params.entryId);
  }
}
