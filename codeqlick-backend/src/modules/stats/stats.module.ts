import { Module } from '@nestjs/common';
import { AdminOverviewController } from './admin-overview.controller.js';
import { AdminOverviewRepository } from './admin-overview.repository.js';
import { AdminOverviewService } from './admin-overview.service.js';
import { AdminStatsController } from './admin-stats.controller.js';
import { StatsRepository } from './stats.repository.js';
import { StatsService } from './stats.service.js';
import { UmamiClient } from './umami.client.js';

@Module({
  controllers: [AdminStatsController, AdminOverviewController],
  providers: [
    StatsService,
    StatsRepository,
    UmamiClient,
    AdminOverviewService,
    AdminOverviewRepository,
  ],
  exports: [UmamiClient],
})
export class StatsModule {}
