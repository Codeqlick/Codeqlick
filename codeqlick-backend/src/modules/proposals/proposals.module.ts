import { BriefsModule } from '../briefs/briefs.module.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { Module } from '@nestjs/common';
import { AdminProposalsController } from './admin-proposals.controller.js';
import { PortalProposalsController } from './portal-proposals.controller.js';
import { ProposalTemplatesController } from './proposal-templates.controller.js';
import { ProposalTemplatesRepository } from './proposal-templates.repository.js';
import { ProposalTemplatesService } from './proposal-templates.service.js';
import { ProposalsRepository } from './proposals.repository.js';
import { ProposalsService } from './proposals.service.js';

@Module({
  imports: [AccountsModule, BriefsModule],
  controllers: [PortalProposalsController, AdminProposalsController, ProposalTemplatesController],
  providers: [
    ProposalsService,
    ProposalsRepository,
    ProposalTemplatesService,
    ProposalTemplatesRepository,
  ],
  exports: [ProposalsService],
})
export class ProposalsModule {}
