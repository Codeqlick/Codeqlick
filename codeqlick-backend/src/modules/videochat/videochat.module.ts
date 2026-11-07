import { Module } from '@nestjs/common';
import { VideochatAdminController } from './videochat-admin.controller.js';
import { VideochatController } from './videochat.controller.js';
import { VideochatGateway } from './videochat.gateway.js';
import { VideochatRepository } from './videochat.repository.js';
import { VideochatService } from './videochat.service.js';

/** The random 1:1 video chat at videochat.codeqlick.com (architecture 4.7). */
@Module({
  controllers: [VideochatController, VideochatAdminController],
  providers: [VideochatService, VideochatRepository, VideochatGateway],
})
export class VideochatModule {}
