import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { AuthService } from '../auth/auth.service.js';
import { MailService } from '../mail/mail.service.js';
import { proposalExpiringEmail, proposalExpiringTeamEmail } from './proposal-emails.js';
import { ProposalsRepository } from './proposals.repository.js';
import { madridToday, toView } from './proposals.service.js';

const RUN_EVERY_MS = 6 * 3_600_000;
const DAY_MS = 86_400_000;
/** Reminded when its last day is today or within this many days. */
export const REMIND_DAYS_BEFORE = 3;

/** `yyyy-mm-dd` plus some days, as a date at midnight UTC (how `@db.Date` columns compare). */
function dayPlus(day: string, days: number): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS);
}

/**
 * Reminds the client, once, that a sent proposal is about to expire, and tells the team
 * (architecture 4.6). Every 6 hours, off in tests.
 */
@Injectable()
export class ProposalRemindersService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ProposalRemindersService.name);
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    private readonly repository: ProposalsRepository,
    private readonly accounts: AccountsService,
    private readonly auth: AuthService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.nodeEnv === 'test') return;
    this.timer = setInterval(() => void this.runDue(), RUN_EVERY_MS);
    this.timer.unref();
    setTimeout(() => void this.runDue(), 180_000).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Sends the reminders due; returns how many proposals were reminded. Never throws. */
  async runDue(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let reminded = 0;
    try {
      const today = madridToday(now);
      const due = await this.repository.expiringSoon(
        dayPlus(today, 0),
        dayPlus(today, REMIND_DAYS_BEFORE),
        // One sent with only a few days of validity isn't reminded the moment it arrives.
        new Date(now.getTime() - DAY_MS),
      );
      for (const row of due) {
        try {
          const view = toView(row, today);
          const proposal = { ...view, validUntil: view.validUntil ?? today };
          let clientNotified = false;
          for (const person of await this.accounts.people(row.clientId)) {
            try {
              const link = person.registered
                ? `${this.config.siteUrl}/${person.locale}/portal/proposals/${row.id}`
                : await this.auth.signupInvitationLink(person, person.locale);
              await this.mail.send(
                proposalExpiringEmail(
                  person,
                  proposal,
                  link,
                  person.locale,
                  this.config.siteUrl,
                  !person.registered,
                ),
              );
              clientNotified = true;
            } catch (error) {
              const reason = error instanceof Error ? error.message : String(error);
              this.logger.error(`Expiry reminder to ${person.email} failed: ${reason}`);
            }
          }
          // Nobody could be emailed (mail down): try again on the next run.
          if (!clientNotified) continue;
          await this.repository.markReminded(row.id, now);
          reminded += 1;
          await this.mail
            .send(
              proposalExpiringTeamEmail(
                this.config.leadsNotifyTo,
                row.client,
                proposal,
                `${this.config.siteUrl}/es/admin/proposals/${row.id}`,
                this.config.siteUrl,
              ),
            )
            .catch((error: unknown) => {
              const reason = error instanceof Error ? error.message : String(error);
              this.logger.error(`Expiry notice to the team failed: ${reason}`);
            });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.error(`Expiry reminder of proposal #${row.number} failed: ${reason}`);
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Proposal reminders failed: ${reason}`);
    } finally {
      this.running = false;
    }
    return reminded;
  }
}
