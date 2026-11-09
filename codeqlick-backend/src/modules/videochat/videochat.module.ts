import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { VideochatPhotoStorage } from '../swipe/swipe.storage.js';
import { VideochatAdminController } from './videochat-admin.controller.js';
import { VideochatController, VideochatPublicController } from './videochat.controller.js';
import { VideochatGateway } from './videochat.gateway.js';
import { VideochatPushService } from './videochat-push.service.js';
import { VideochatRepository } from './videochat.repository.js';
import { VideochatService } from './videochat.service.js';
import { VideochatStatsRepository } from './videochat-stats.repository.js';
import { VideochatStatsService } from './videochat-stats.service.js';
import { VideochatSuspiciousService } from './videochat-suspicious.service.js';
import { VideochatVerificationService } from './videochat-verification.service.js';

/** The random 1:1 video chat at videochat.codeqlick.com (architecture 4.7). */
@Module({
  imports: [AuthModule],
  controllers: [VideochatController, VideochatPublicController, VideochatAdminController],
  providers: [
    VideochatService,
    VideochatRepository,
    VideochatGateway,
    VideochatPushService,
    VideochatStatsService,
    VideochatStatsRepository,
    VideochatSuspiciousService,
    VideochatVerificationService,
    VideochatPhotoStorage,
  ],
})
export class VideochatModule {}
