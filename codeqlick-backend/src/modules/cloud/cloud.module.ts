import { Module } from '@nestjs/common';
import { API_TOKEN_RESOLVER } from '../../common/api-tokens.js';
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

/** Codeqlick Cloud (architecture 4.13). Its API tokens are resolved for JwtAuthGuard. */
@Module({
  // The public controller first: its POST cli/device/token must win over cli/device/:userCode.
  controllers: [
    CloudPublicController,
    CloudFormsPublicController,
    CloudMonitorsPublicController,
    CloudBuildsPublicController,
    CloudController,
    CloudFormsController,
    CloudMonitorsController,
    CloudAuditsController,
    CloudBuildsController,
    CloudNotificationsController,
    CloudAdminController,
  ],
  providers: [
    CloudRepository,
    CloudTokensRepository,
    CloudStorage,
    CloudDns,
    CloudTokensService,
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
    GithubClient,
    { provide: API_TOKEN_RESOLVER, useExisting: CloudTokensService },
  ],
  exports: [API_TOKEN_RESOLVER, CloudTeamsService],
})
export class CloudModule {}
