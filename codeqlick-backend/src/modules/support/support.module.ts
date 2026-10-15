import { AccountsModule } from '../accounts/accounts.module.js';
import { Module } from '@nestjs/common';
import { AdminSupportController } from './admin-support.controller.js';
import { PortalSupportController } from './portal-support.controller.js';
import { SupportRepository } from './support.repository.js';
import { SupportService } from './support.service.js';
import { TicketFilesStorage } from './ticket-files.storage.js';

@Module({
  imports: [AccountsModule],
  controllers: [PortalSupportController, AdminSupportController],
  providers: [SupportService, SupportRepository, TicketFilesStorage],
  exports: [SupportService],
})
export class SupportModule {}
