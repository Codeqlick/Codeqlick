import { Module } from '@nestjs/common';
import { CloudModule } from '../cloud/cloud.module.js';
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
import { SiteBuilderModule } from './site-builder.module.js';
import { AdminSiteNewsController, SiteNewsController } from './site-news.controller.js';
import { SiteNewsRepository } from './site-news.repository.js';
import { SiteNewsService } from './site-news.service.js';
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
import { SiteDraftsController } from './site-drafts.controller.js';
import { SiteEditorService } from './site-editor.service.js';
import { SiteVisitsService } from './site-visits.service.js';
import { SitePurchasesRepository } from './site-purchases.repository.js';
import { SitePurchasesService } from './site-purchases.service.js';
import { StripeModule } from './stripe.module.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';

@Module({
  imports: [
    CloudModule,
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
    SiteBuilderModule,
    StripeModule,
  ],
  controllers: [
    ManagedSitesController,
    PortalSitesController,
    SiteRequestsController,
    SiteVisitsController,
    SiteDraftsController,
    SiteNewsController,
    AdminSiteNewsController,
    StripeWebhookController,
  ],
  providers: [
    ManagedSitesService,
    ManagedSitesRepository,
    SiteOnboardingService,
    PortalSitesService,
    SiteVisitsService,
    SiteDomainsService,
    SitePreviewsService,
    SitePreviewsRepository,
    SiteProposalsService,
    SiteReportsService,
    SiteEditorService,
    SiteNewsRepository,
    SiteNewsService,
    SitePurchasesService,
    SitePurchasesRepository,
  ],
  exports: [ManagedSitesService],
})
export class ManagedSitesModule {}
