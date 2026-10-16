import { Module } from '@nestjs/common';
import { AdminStatsController } from './admin-stats.controller.js';
import { StatsRepository } from './stats.repository.js';
import { StatsService } from './stats.service.js';
import { UmamiClient } from './umami.client.js';

@Module({
  controllers: [AdminStatsController],
  providers: [StatsService, StatsRepository, UmamiClient],
  exports: [UmamiClient],
})
export class StatsModule {}
