import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { readDiskSpace, type DiskReading } from '../../common/disk-space.js';
import { AppConfigService } from '../../config/app-config.service.js';

export { diskState, type DiskReading, type DiskState } from '../../common/disk-space.js';

const CHECK_MS = 60_000;

/**
 * The disk guard (architecture 4.13 "Disk guard (one server)", decision 49): the free space of the
 * disk holding CLOUD_ROOT, read every minute. Below the floor Cloud stops growing.
 */
@Injectable()
export class CloudDiskService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CloudDiskService.name);
  private timer?: NodeJS.Timeout;
  private last?: DiskReading;

  constructor(private readonly config: AppConfigService) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.read(), CHECK_MS).unref();
    void this.read();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Reads the disk now; null when Cloud's folder isn't set up. */
  async read(): Promise<DiskReading | null> {
    const root = this.config.cloudHosting?.root;
    if (!root) return null;
    try {
      const reading = await readDiskSpace(root, this.config.cloudDisk);
      if (reading.state !== this.last?.state && reading.state !== 'ok') {
        this.logger.warn(`Cloud's disk is ${reading.state}: ${reading.freeBytes} bytes free`);
      }
      this.last = reading;
      return reading;
    } catch (error) {
      this.logger.error(`The disk couldn't be read: ${String(error)}`);
      return this.last ?? null;
    }
  }

  /** Whether Cloud must stop growing (the last reading; unknown counts as not full). */
  get full(): boolean {
    return this.last?.state === 'full';
  }

  /** Refuses what would make Cloud grow while the disk is short of space. */
  assertRoom(): void {
    if (this.full) {
      throw new HttpException(
        'Codeqlick Cloud is short of space; try again later',
        HttpStatus.INSUFFICIENT_STORAGE,
      );
    }
  }
}
