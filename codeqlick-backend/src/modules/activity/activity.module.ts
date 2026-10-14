import { Global, Module } from '@nestjs/common';
import { ActivityRepository } from './activity.repository.js';
import { ActivityService } from './activity.service.js';
import { AdminActivityController } from './admin-activity.controller.js';

/** Global: every module that changes data records it here. */
@Global()
@Module({
  controllers: [AdminActivityController],
  providers: [ActivityService, ActivityRepository],
  exports: [ActivityService],
})
export class ActivityModule {}
