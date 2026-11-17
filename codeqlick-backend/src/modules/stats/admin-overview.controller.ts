import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { AdminOverviewService } from './admin-overview.service.js';
import type { AdminOverview } from './admin-overview.rules.js';

/** The whole platform at a glance (architecture 4.17, decision 122): aggregates only. */
@ApiTags('admin/stats')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/overview')
export class AdminOverviewController {
  constructor(private readonly overview: AdminOverviewService) {}

  @Get()
  get(): Promise<AdminOverview> {
    return this.overview.overview();
  }
}
