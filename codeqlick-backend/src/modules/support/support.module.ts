import { Module } from '@nestjs/common';
import { AdminSupportController } from './admin-support.controller.js';
import { PortalSupportController } from './portal-support.controller.js';
import { SupportRepository } from './support.repository.js';
import { SupportService } from './support.service.js';

@Module({
  controllers: [PortalSupportController, AdminSupportController],
  providers: [SupportService, SupportRepository],
  exports: [SupportService],
})
export class SupportModule {}
