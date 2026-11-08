import { Module } from '@nestjs/common';
import { MeetingsController, MeetingsPublicController } from './meetings.controller.js';
import { MeetingsGateway } from './meetings.gateway.js';
import { MeetingsRepository } from './meetings.repository.js';
import { MeetingsService } from './meetings.service.js';

/** Video meetings by link at meetings.codeqlick.com (architecture 4.8). */
@Module({
  controllers: [MeetingsPublicController, MeetingsController],
  providers: [MeetingsService, MeetingsRepository, MeetingsGateway],
  exports: [MeetingsService],
})
export class MeetingsModule {}
