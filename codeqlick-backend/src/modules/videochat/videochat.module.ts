import { Module } from '@nestjs/common';
import { VideochatAdminController } from './videochat-admin.controller.js';
import { VideochatController, VideochatPublicController } from './videochat.controller.js';
import { VideochatGateway } from './videochat.gateway.js';
import { VideochatPushService } from './videochat-push.service.js';
import { VideochatRepository } from './videochat.repository.js';
import { VideochatService } from './videochat.service.js';
import { VideochatStatsRepository } from './videochat-stats.repository.js';
import { VideochatStatsService } from './videochat-stats.service.js';

/** The random 1:1 video chat at videochat.codeqlick.com (architecture 4.7). */
@Module({
  controllers: [VideochatController, VideochatPublicController, VideochatAdminController],
  providers: [
    VideochatService,
    VideochatRepository,
    VideochatGateway,
    VideochatPushService,
    VideochatStatsService,
    VideochatStatsRepository,
  ],
})
export class VideochatModule {}
