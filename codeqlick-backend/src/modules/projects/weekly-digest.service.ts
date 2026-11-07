import {
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import type { Locale } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { MailService } from '../mail/mail.service.js';
import { digestHasNews, weeklyDigestEmail, type DigestProject } from './digest-email.js';
import { digestWeekStart } from './digest-schedule.js';
import { ProjectsRepository } from './projects.repository.js';

const HOUR_MS = 3_600_000;
const WEEK_MS = 7 * 24 * HOUR_MS;

export type DigestResult = { sent: true } | { sent: false; reason: 'no-news' | 'opted-out' };

/**
 * The Monday summary for clients. An hourly check sends this week's one to every active client
 * who wants it and hasn't had it (so a restart or a missed Monday doesn't skip or repeat it).
 * Weeks with nothing to tell send nothing.
 */
@Injectable()
export class WeeklyDigestService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WeeklyDigestService.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly repository: ProjectsRepository,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    // Tests run against a shared database and start the app many times: no background work there.
    if (this.config.nodeEnv === 'test') return;
    this.timer = setInterval(() => void this.runDue(), HOUR_MS);
    this.timer.unref();
    setTimeout(() => void this.runDue(), 120_000).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Sends this week's summary to everyone due. Never throws. */
  async runDue(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const recipients = await this.repository.listDigestRecipients(digestWeekStart(now));
      for (const client of recipients) {
        try {
          await this.sendTo(client, now, true);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.error(`Weekly summary for ${client.email} failed: ${reason}`);
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Weekly summaries failed: ${reason}`);
    } finally {
      this.running = false;
    }
  }

  /** Sends one client's summary now (admin panel), whatever day it is. */
  async sendNow(clientId: string): Promise<DigestResult> {
    const client = await this.repository.findClient(clientId);
    if (!client || client.role !== 'CLIENT' || !client.isActive) {
      throw new NotFoundException('Client not found');
    }
    return this.sendTo(client, new Date(), false);
  }

  /** `scheduled`: the Monday run, which also records a week with nothing to tell. */
  private async sendTo(
    client: { id: string; name: string; email: string; locale: Locale; memberOfId: string | null },
    now: Date,
    scheduled: boolean,
  ): Promise<DigestResult> {
    const since = new Date(now.getTime() - WEEK_MS);
    // A member of a client company gets the summary of the company account's projects.
    const rows = await this.repository.projectsForDigest(client.memberOfId ?? client.id, since);
    const projects: DigestProject[] = rows.map((project) => {
      const next = project.milestones.find((m) => !m.completedAt);
      return {
        id: project.id,
        name: project.name,
        phase: project.phase,
        progress: project.progress,
        updates: project.updates.filter((u) => u.createdAt >= since).map((u) => u.title),
        milestonesDone: project.milestones
          .filter((m) => m.completedAt && m.completedAt >= since)
          .map((m) => m.title),
        nextMilestone: next ? { title: next.title, dueDate: next.dueDate } : null,
        awaitingApproval: project.updates
          .filter((u) => u.approvalRequested && !u.approvedAt)
          .map((u) => u.title),
      };
    });

    if (!digestHasNews(projects)) {
      // Nothing to tell this week: don't look again until next Monday.
      if (scheduled) await this.repository.markDigestSent(client.id, now);
      return { sent: false, reason: 'no-news' };
    }
    const locale = toApiLocale(client.locale);
    const site = this.config.siteUrl;
    await this.mail.send(
      weeklyDigestEmail(
        client,
        projects.filter(
          (p) =>
            p.updates.length ||
            p.milestonesDone.length ||
            p.awaitingApproval.length ||
            p.nextMilestone,
        ),
        `${site}/${locale}/portal`,
        `${site}/${locale}/portal/account`,
        locale,
        site,
      ),
    );
    await this.repository.markDigestSent(client.id, now);
    this.logger.log(`Weekly summary sent to ${client.email}`);
    return { sent: true };
  }
}
