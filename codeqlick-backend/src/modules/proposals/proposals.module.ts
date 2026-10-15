import { AccountsModule } from '../accounts/accounts.module.js';
import { Module } from '@nestjs/common';
import { AdminProposalsController } from './admin-proposals.controller.js';
import { PortalProposalsController } from './portal-proposals.controller.js';
import { ProposalsRepository } from './proposals.repository.js';
import { ProposalsService } from './proposals.service.js';

@Module({
  imports: [AccountsModule],
  controllers: [PortalProposalsController, AdminProposalsController],
  providers: [ProposalsService, ProposalsRepository],
  exports: [ProposalsService],
})
export class ProposalsModule {}
