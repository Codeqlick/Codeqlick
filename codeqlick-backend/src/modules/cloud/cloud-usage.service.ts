import { Injectable } from '@nestjs/common';
import { CloudAnalyticsRepository } from './cloud-analytics.repository.js';
import { CloudBuildsRepository } from './cloud-builds.repository.js';
import { madridMonth } from './cloud-form-fields.js';
import { CloudFormsRepository } from './cloud-forms.repository.js';
import { CLOUD_PLANS } from './cloud-plans.js';
import { buildMeters, type Meter } from './cloud-usage.js';
import { CloudRepository } from './cloud.repository.js';

const HOUR_MS = 3_600_000;

/**
 * The five measures of a team against its plan (architecture 4.13 "Usage alerts"): the counts the
 * limits themselves use, so an alert, the console and a refusal never disagree.
 */
@Injectable()
export class CloudUsageService {
  constructor(
    private readonly cloud: CloudRepository,
    private readonly builds: CloudBuildsRepository,
    private readonly forms: CloudFormsRepository,
    private readonly analytics: CloudAnalyticsRepository,
  ) {}

  async meters(teamId: string, plan: 'FREE' | 'PRO', now = new Date()): Promise<Meter[]> {
    const since = madridMonth(now).start;
    const [builds, formSubmissions, analyticsEvents, storage, deploymentsPerHour] =
      await Promise.all([
        this.builds.countBuildsSince(teamId, since),
        this.forms.teamSubmissionsSince(teamId, since),
        this.analytics.teamEventsSince(teamId, since),
        this.cloud.storageBytes(teamId),
        this.cloud.countDeploymentsSince(teamId, new Date(now.getTime() - HOUR_MS)),
      ]);
    return buildMeters(CLOUD_PLANS[plan], {
      builds,
      formSubmissions,
      analyticsEvents,
      storage,
      deploymentsPerHour,
    });
  }
}
