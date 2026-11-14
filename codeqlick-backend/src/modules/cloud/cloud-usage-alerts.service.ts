import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { MailService } from '../mail/mail.service.js';
import { CloudBillingService } from './cloud-billing.service.js';
import { cloudUsageAlertEmail } from './cloud-emails.js';
import { madridMonth } from './cloud-form-fields.js';
import { CloudTeamsService } from './cloud-teams.service.js';
import { crossing } from './cloud-usage.js';
import { CloudUsageAlertsRepository } from './cloud-usage-alerts.repository.js';
import { CloudUsageService } from './cloud-usage.service.js';
import { CloudRepository } from './cloud.repository.js';

const SWEEP_MS = 10 * 60_000;
const FIRST_LOOKBACK_MS = 3_600_000;
const DAY_MS = 86_400_000;
const KEEP_MONTHS = 13;

/**
 * Tells a team's owners it is close to a plan limit (architecture 4.13 "Usage alerts", decision
 * 54): a sweep over the teams with recent activity, one claimed row per team, limit and month.
 */
@Injectable()
export class CloudUsageAlertsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CloudUsageAlertsService.name);
  private timer?: NodeJS.Timeout;
  private lastSweep?: Date;
  private lastCleanup?: Date;
  private running = false;
  /** Teams whose check failed: looked at again next sweep, whatever their activity. */
  private readonly retry = new Set<string>();

  constructor(
    private readonly alerts: CloudUsageAlertsRepository,
    private readonly usage: CloudUsageService,
    private readonly cloud: CloudRepository,
    private readonly teams: CloudTeamsService,
    private readonly billing: CloudBillingService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.sweep(), SWEEP_MS).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass; returns how many alerts it claimed (and so sent). */
  async sweep(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let claimed = 0;
    try {
      const since = this.lastSweep ?? new Date(now.getTime() - FIRST_LOOKBACK_MS);
      const active = await this.alerts.activeTeamIds(since);
      for (const teamId of new Set([...active, ...this.retry])) {
        try {
          claimed += await this.checkTeam(teamId, now);
          this.retry.delete(teamId);
        } catch (error) {
          this.retry.add(teamId);
          this.logger.error(`Team ${teamId}: the usage alerts failed: ${String(error)}`);
        }
      }
      this.lastSweep = now;
      await this.cleanup(now);
    } catch (error) {
      this.logger.error(`The usage alerts sweep failed: ${String(error)}`);
    } finally {
      this.running = false;
    }
    return claimed;
  }

  private async checkTeam(teamId: string, now: Date): Promise<number> {
    const team = await this.alerts.team(teamId);
    if (!team) return 0;
    const due = crossing(await this.usage.meters(team.id, team.plan, now));
    if (due.length === 0) return 0;
    const period = madridMonth(now).key;
    const proHint = team.plan === 'FREE' && this.billing.available;
    let claimed = 0;
    for (const meter of due) {
      const won = await this.alerts.claim({
        teamId: team.id,
        key: meter.key,
        period,
        percent: meter.percent,
        used: meter.used,
        limit: meter.limit,
      });
      if (!won) continue;
      claimed += 1;
      let emailed = 0;
      for (const owner of await this.cloud.ownerEmails(team.id)) {
        try {
          const locale = toApiLocale(owner.locale);
          const base = `${this.config.cloudUrl}/${locale}/console/${team.slug}`;
          await this.mail.send(
            cloudUsageAlertEmail({
              to: owner.email,
              locale,
              team: team.name,
              key: meter.key,
              used: meter.used,
              limit: meter.limit,
              percent: meter.percent,
              proHint,
              url: base,
              planUrl: `${base}/plan`,
              siteUrl: this.config.siteUrl,
            }),
          );
          emailed += 1;
        } catch (error) {
          // Like the other limit emails: logged, and not retried this month.
          this.logger.error(
            `Team ${team.id}: the ${meter.key} alert email to an owner failed: ${String(error)}`,
          );
        }
      }
      await this.teams.recordSystem(team.id, 'Codeqlick', 'usage.alert_sent', meter.key, {
        key: meter.key,
        period,
        percent: meter.percent,
        used: meter.used,
        limit: meter.limit,
        emailed,
      });
    }
    return claimed;
  }

  /** Rows older than 13 months, once a day. */
  private async cleanup(now: Date): Promise<void> {
    if (this.lastCleanup && now.getTime() - this.lastCleanup.getTime() < DAY_MS) return;
    this.lastCleanup = now;
    const before = new Date(now);
    before.setUTCMonth(before.getUTCMonth() - KEEP_MONTHS);
    await this.alerts.deleteOlderThan(before);
  }
}
