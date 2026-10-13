import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { StatsService, type AdminStats } from './stats.service.js';

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
}
