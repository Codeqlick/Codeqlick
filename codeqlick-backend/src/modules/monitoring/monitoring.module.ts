import { Module } from '@nestjs/common';
import { MonitoringController } from './monitoring.controller.js';
import { MonitoringRepository } from './monitoring.repository.js';
import { MonitoringService } from './monitoring.service.js';

@Module({
  controllers: [MonitoringController],
  providers: [MonitoringService, MonitoringRepository],
  exports: [MonitoringService],
})
export class MonitoringModule {}
