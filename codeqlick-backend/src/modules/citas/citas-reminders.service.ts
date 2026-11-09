import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { CitasService } from './citas.service.js';

/** First run shortly after start-up, then every 15 minutes. */
const FIRST_RUN_DELAY_MS = 90_000;
const INTERVAL_MS = 15 * 60_000;

/**
 * Sends the Citas reminders (about 24 h before each appointment). Runs in the API process: there
 * is a single instance, and each reminder is claimed in the database before it is sent.
 */
@Injectable()
export class CitasRemindersService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CitasRemindersService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly citas: CitasService,
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
    try {
      const sent = await this.citas.sendReminders(now);
      if (sent > 0) this.logger.log(`Sent ${sent} Citas reminders`);
    } catch (error) {
      this.logger.error('Citas reminders failed', error instanceof Error ? error.stack : error);
    }
  }
}
