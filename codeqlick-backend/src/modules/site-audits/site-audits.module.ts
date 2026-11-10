import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module.js';
import { SiteAuditsController } from './site-audits.controller.js';
import { SiteAuditsRepository } from './site-audits.repository.js';
import { SiteAuditsService } from './site-audits.service.js';

@Module({
  imports: [LeadsModule],
  controllers: [SiteAuditsController],
  providers: [SiteAuditsService, SiteAuditsRepository],
})
export class SiteAuditsModule {}
