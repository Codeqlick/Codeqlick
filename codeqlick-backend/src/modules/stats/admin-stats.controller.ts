import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import {
  timelineQuerySchema,
  visitsQuerySchema,
  type TimelineQuery,
  type VisitsQuery,
} from './stats.schemas.js';
import { StatsService, type AdminStats, type AdminTimeline } from './stats.service.js';
import { UmamiClient, type SiteVisits } from './umami.client.js';

@ApiTags('admin/stats')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/stats')
export class AdminStatsController {
  constructor(
    private readonly stats: StatsService,
    private readonly umami: UmamiClient,
  ) {}

  @Get()
  get(): Promise<AdminStats> {
    return this.stats.get();
  }

  /** Leads, won leads, posts and case studies per month, for the dashboard charts. */
  @Get('timeline')
  timeline(@Query({ schema: timelineQuerySchema }) query: TimelineQuery): Promise<AdminTimeline> {
    return this.stats.timeline(query.months);
  }

  /** The public site's visits over the last `days` days, from Umami. */
  @Get('visits')
  visits(@Query({ schema: visitsQuerySchema }) query: VisitsQuery): Promise<SiteVisits> {
    return this.umami.visits(query.days);
  }
}
