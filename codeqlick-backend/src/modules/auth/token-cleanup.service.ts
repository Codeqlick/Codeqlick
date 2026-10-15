import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { AuthRepository } from './auth.repository.js';

const DAY_MS = 86_400_000;

/**
 * Expired rows are kept this long before they are deleted, so a rotated refresh token that comes
 * back shortly after expiring is still recognised as reuse instead of as an unknown token.
 */
export const EXPIRED_RETENTION_DAYS = 30;

/** First run shortly after start-up, then twice a day. */
const FIRST_RUN_DELAY_MS = 60_000;
const INTERVAL_MS = 12 * 3_600_000;

/**
 * Deletes expired refresh-token sessions and password reset tokens, which are otherwise never
 * removed. Runs in the API process: there is a single instance, and the deletes are idempotent.
 */
@Injectable()
export class TokenCleanupService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TokenCleanupService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly repository: AuthRepository,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    // Tests run against a shared database and start the app many times: no background work there.
    if (this.config.nodeEnv === 'test') return;
    this.timer = setTimeout(() => {
      void this.run();
      this.timer = setInterval(() => void this.run(), INTERVAL_MS).unref();
    }, FIRST_RUN_DELAY_MS).unref();
  }

  onApplicationShutdown(): void {
    clearTimeout(this.timer);
  }

  /** Never throws: a failed run is logged and retried at the next interval. */
  async run(now = new Date()): Promise<void> {
    const before = new Date(now.getTime() - EXPIRED_RETENTION_DAYS * DAY_MS);
    try {
      const { sessions, resetTokens } = await this.repository.deleteExpired(before);
      if (sessions > 0 || resetTokens > 0) {
        this.logger.log(
          `Deleted ${sessions} expired sessions and ${resetTokens} expired reset tokens`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Expired token cleanup failed',
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
