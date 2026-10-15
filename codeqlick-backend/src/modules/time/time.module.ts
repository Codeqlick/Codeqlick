import { Module } from '@nestjs/common';
import { AdminTimeController } from './admin-time.controller.js';
import { PortalTimeController } from './portal-time.controller.js';
import { TimeRepository } from './time.repository.js';
import { TimeService } from './time.service.js';

@Module({
  controllers: [AdminTimeController, PortalTimeController],
  providers: [TimeService, TimeRepository],
})
export class TimeModule {}
