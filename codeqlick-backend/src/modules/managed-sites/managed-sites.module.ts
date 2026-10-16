import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module.js';
import { DomainsModule } from '../domains/domains.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { MediaModule } from '../media/media.module.js';
import { MonitoringModule } from '../monitoring/monitoring.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { ProposalsModule } from '../proposals/proposals.module.js';
import { SiteFormsModule } from '../site-forms/site-forms.module.js';
import { StatsModule } from '../stats/stats.module.js';
import { UsersModule } from '../users/users.module.js';
import { ManagedSitesController } from './managed-sites.controller.js';
import { ManagedSitesRepository } from './managed-sites.repository.js';
import { ManagedSitesService } from './managed-sites.service.js';
import { SiteBuilderClient } from './site-builder.client.js';
import { SiteDomainsService } from './site-domains.service.js';
import { SitePreviewsRepository } from './site-previews.repository.js';
import { SitePreviewsService } from './site-previews.service.js';
import { SiteProposalsService } from './site-proposals.service.js';
import { SiteReportsService } from './site-reports.service.js';
import { SiteOnboardingService } from './site-onboarding.service.js';
import { PortalSitesController } from './portal-sites.controller.js';
import { PortalSitesService } from './portal-sites.service.js';
import { SiteRequestsController } from './site-requests.controller.js';
import { SiteVisitsController } from './site-visits.controller.js';
import { SiteVisitsService } from './site-visits.service.js';

@Module({
  imports: [
    SiteFormsModule,
    UsersModule,
    ProjectsModule,
    ProposalsModule,
    LeadsModule,
    MonitoringModule,
    MediaModule,
    StatsModule,
    DomainsModule,
    AccountsModule,
  ],
  controllers: [
    ManagedSitesController,
    PortalSitesController,
    SiteRequestsController,
    SiteVisitsController,
  ],
  providers: [
    ManagedSitesService,
    ManagedSitesRepository,
    SiteBuilderClient,
    SiteOnboardingService,
    PortalSitesService,
    SiteVisitsService,
    SiteDomainsService,
    SitePreviewsService,
    SitePreviewsRepository,
    SiteProposalsService,
    SiteReportsService,
  ],
  exports: [ManagedSitesService],
})
export class ManagedSitesModule {}
