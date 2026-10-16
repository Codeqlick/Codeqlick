import { Module } from '@nestjs/common';
import { DomainsModule } from '../domains/domains.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { MediaModule } from '../media/media.module.js';
import { MonitoringModule } from '../monitoring/monitoring.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { SiteFormsModule } from '../site-forms/site-forms.module.js';
import { StatsModule } from '../stats/stats.module.js';
import { UsersModule } from '../users/users.module.js';
import { ManagedSitesController } from './managed-sites.controller.js';
import { ManagedSitesRepository } from './managed-sites.repository.js';
import { ManagedSitesService } from './managed-sites.service.js';
import { SiteBuilderClient } from './site-builder.client.js';
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
    LeadsModule,
    MonitoringModule,
    MediaModule,
    StatsModule,
    DomainsModule,
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
  ],
  exports: [ManagedSitesService],
})
export class ManagedSitesModule {}
