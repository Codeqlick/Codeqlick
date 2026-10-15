import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { Paginated } from '../../common/types/paginated.js';
import { listActivityQuerySchema, type ListActivityQuery } from './activity.schemas.js';
import { ActivityService, type ActivityEntry } from './activity.service.js';

@ApiTags('admin/activity')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/activity')
export class AdminActivityController {
  constructor(private readonly activity: ActivityService) {}

  @Get()
  list(
    @Query({ schema: listActivityQuerySchema }) query: ListActivityQuery,
  ): Promise<Paginated<ActivityEntry>> {
    return this.activity.list(query);
  }
}
