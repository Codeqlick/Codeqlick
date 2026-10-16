import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module.js';
import { MonitoringModule } from '../monitoring/monitoring.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { SiteFormsModule } from '../site-forms/site-forms.module.js';
import { UsersModule } from '../users/users.module.js';
import { ManagedSitesController } from './managed-sites.controller.js';
import { ManagedSitesRepository } from './managed-sites.repository.js';
import { ManagedSitesService } from './managed-sites.service.js';
import { SiteBuilderClient } from './site-builder.client.js';
import { SiteOnboardingService } from './site-onboarding.service.js';

@Module({
  imports: [SiteFormsModule, UsersModule, ProjectsModule, LeadsModule, MonitoringModule],
  controllers: [ManagedSitesController],
  providers: [
    ManagedSitesService,
    ManagedSitesRepository,
    SiteBuilderClient,
    SiteOnboardingService,
  ],
  exports: [ManagedSitesService],
})
export class ManagedSitesModule {}
