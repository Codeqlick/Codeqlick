import { Module } from '@nestjs/common';
import { StripeModule } from '../managed-sites/stripe.module.js';
import { API_TOKEN_RESOLVER } from '../../common/api-tokens.js';
import {
  CloudAnalyticsController,
  CloudAnalyticsPublicController,
} from './cloud-analytics.controller.js';
import { CloudAnalyticsRepository } from './cloud-analytics.repository.js';
import { CloudAnalyticsService } from './cloud-analytics.service.js';
import { CloudKvController, CloudKvPublicController } from './cloud-kv.controller.js';
import { CloudKvRepository } from './cloud-kv.repository.js';
import { CloudKvService } from './cloud-kv.service.js';
import { CloudBillingController } from './cloud-billing.controller.js';
import { CloudBillingRepository } from './cloud-billing.repository.js';
import { CloudBillingService } from './cloud-billing.service.js';
import { CloudDiskService } from './cloud-disk.service.js';
import { CloudDatabasesController } from './cloud-databases.controller.js';
import { CloudDatabasesRepository } from './cloud-databases.repository.js';
import { CloudDatabasesService } from './cloud-databases.service.js';
import { CloudPgClient } from './cloud-pg.client.js';
import { CloudStorageController } from './cloud-storage.controller.js';
import { CloudStorageRepository } from './cloud-storage.repository.js';
import { CloudStorageService } from './cloud-storage.service.js';
import { GarageClient } from './garage.client.js';
import { CloudAdminController } from './cloud-admin.controller.js';
import { CloudAuditsController } from './cloud-audits.controller.js';
import { CloudAuditsRepository } from './cloud-audits.repository.js';
import { CloudAuditsService } from './cloud-audits.service.js';
import { CloudBuildsController, CloudBuildsPublicController } from './cloud-builds.controller.js';
import { CloudBuildsRepository } from './cloud-builds.repository.js';
import { CloudBuildsService } from './cloud-builds.service.js';
import { GithubClient } from './github.client.js';
import { CloudFormsController, CloudFormsPublicController } from './cloud-forms.controller.js';
import { CloudFormsRepository } from './cloud-forms.repository.js';
import { CloudFormsService } from './cloud-forms.service.js';
import {
  CloudMonitorsController,
  CloudMonitorsPublicController,
} from './cloud-monitors.controller.js';
import { CloudMonitorsRepository } from './cloud-monitors.repository.js';
import { CloudMonitorsService } from './cloud-monitors.service.js';
import { CloudNotificationsController } from './cloud-notifications.controller.js';
import { CloudNotificationsRepository } from './cloud-notifications.repository.js';
import { CloudNotificationsService } from './cloud-notifications.service.js';
import { CloudAdminService } from './cloud-admin.service.js';
import { CloudController, CloudPublicController } from './cloud.controller.js';
import { CloudDns, CloudDomainsService } from './cloud-domains.service.js';
import { CloudProjectsService } from './cloud-projects.service.js';
import { CloudRepository } from './cloud.repository.js';
import { CloudStorage } from './cloud.storage.js';
import { CloudTeamsService } from './cloud-teams.service.js';
import { CloudTokensRepository } from './cloud-tokens.repository.js';
import { CloudTokensService } from './cloud-tokens.service.js';
import { CloudUsageAlertsRepository } from './cloud-usage-alerts.repository.js';
import { CloudUsageAlertsService } from './cloud-usage-alerts.service.js';
import { CloudUsageService } from './cloud-usage.service.js';

/** Codeqlick Cloud (architecture 4.13). Its API tokens are resolved for JwtAuthGuard. */
@Module({
  imports: [StripeModule],
  // The public controller first: its POST cli/device/token must win over cli/device/:userCode.
  controllers: [
    CloudPublicController,
    CloudFormsPublicController,
    CloudMonitorsPublicController,
    CloudBuildsPublicController,
    CloudAnalyticsPublicController,
    CloudKvPublicController,
    CloudController,
    CloudFormsController,
    CloudMonitorsController,
    CloudAuditsController,
    CloudBuildsController,
    CloudNotificationsController,
    CloudAnalyticsController,
    CloudKvController,
    CloudBillingController,
    CloudDatabasesController,
    CloudStorageController,
    CloudAdminController,
  ],
  providers: [
    CloudRepository,
    CloudTokensRepository,
    CloudStorage,
    CloudDns,
    CloudTokensService,
    CloudUsageService,
    CloudUsageAlertsRepository,
    CloudUsageAlertsService,
    CloudTeamsService,
    CloudProjectsService,
    CloudDomainsService,
    CloudAdminService,
    CloudFormsRepository,
    CloudFormsService,
    CloudMonitorsRepository,
    CloudMonitorsService,
    CloudAuditsRepository,
    CloudAuditsService,
    CloudBuildsRepository,
    CloudBuildsService,
    CloudNotificationsRepository,
    CloudNotificationsService,
    CloudAnalyticsRepository,
    CloudAnalyticsService,
    CloudKvRepository,
    CloudKvService,
    CloudBillingRepository,
    CloudBillingService,
    CloudDiskService,
    CloudPgClient,
    CloudDatabasesRepository,
    CloudDatabasesService,
    GarageClient,
    CloudStorageRepository,
    CloudStorageService,
    GithubClient,
    { provide: API_TOKEN_RESOLVER, useExisting: CloudTokensService },
  ],
  exports: [API_TOKEN_RESOLVER, CloudTeamsService, CloudBillingService],
})
export class CloudModule {}
