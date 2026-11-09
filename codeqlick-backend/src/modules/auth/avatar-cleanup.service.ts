import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import { AccountRepository } from './account.repository.js';
import { AvatarStorage } from './avatar.storage.js';

const FIRST_MS = 90_000;
const EVERY_MS = 6 * 60 * 60 * 1000;
/** A file younger than this may belong to an upload still being saved. */
const MIN_AGE_MS = 60 * 60 * 1000;

/** Deletes profile photos no account points to any more (deleted accounts), every 6 hours. */
@Injectable()
export class AvatarCleanupService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AvatarCleanupService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly storage: AvatarStorage,
    private readonly repository: AccountRepository,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.nodeEnv === 'test') return;
    const run = () => void this.sweep().catch((error: unknown) => this.logger.error(error));
    this.timers.push(setTimeout(run, FIRST_MS).unref(), setInterval(run, EVERY_MS).unref());
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers) clearTimeout(timer);
  }

  async sweep(now = new Date()): Promise<number> {
    const [files, used] = await Promise.all([this.storage.list(), this.repository.avatarKeys()]);
    let removed = 0;
    for (const file of files) {
      if (used.has(file.name) || now.getTime() - file.modifiedAt.getTime() < MIN_AGE_MS) continue;
      await this.storage.remove(file.name);
      removed += 1;
    }
    if (removed > 0) this.logger.log(`Deleted ${removed} unused profile photos`);
    return removed;
  }
}
