import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { timelineQuerySchema, type TimelineQuery } from './stats.schemas.js';
import { StatsService, type AdminStats, type AdminTimeline } from './stats.service.js';

@ApiTags('admin/stats')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  get(): Promise<AdminStats> {
    return this.stats.get();
  }

  /** Leads, won leads, posts and case studies per month, for the dashboard charts. */
  @Get('timeline')
  timeline(@Query({ schema: timelineQuerySchema }) query: TimelineQuery): Promise<AdminTimeline> {
    return this.stats.timeline(query.months);
  }
}
