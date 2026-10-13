import { Module } from '@nestjs/common';
import { AdminStatsController } from './admin-stats.controller.js';
import { StatsRepository } from './stats.repository.js';
import { StatsService } from './stats.service.js';

@Module({
  controllers: [AdminStatsController],
  providers: [StatsService, StatsRepository],
})
export class StatsModule {}
