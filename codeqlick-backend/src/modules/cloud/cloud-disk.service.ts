import { statfs } from 'node:fs/promises';
import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';

export type DiskState = 'ok' | 'low' | 'full';

export interface DiskReading {
  state: DiskState;
  totalBytes: number;
  freeBytes: number;
  lowBytes: number;
  minBytes: number;
}

/** The state of a disk with `free` bytes left, against the guard's floors. */
export function diskState(free: number, floors: { lowBytes: number; minBytes: number }): DiskState {
  if (free < floors.minBytes) return 'full';
  if (free < floors.lowBytes) return 'low';
  return 'ok';
}

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
      const stats = await statfs(root);
      const floors = this.config.cloudDisk;
      const freeBytes = stats.bavail * stats.bsize;
      const reading: DiskReading = {
        state: diskState(freeBytes, floors),
        totalBytes: stats.blocks * stats.bsize,
        freeBytes,
        ...floors,
      };
      if (reading.state !== this.last?.state && reading.state !== 'ok') {
        this.logger.warn(`Cloud's disk is ${reading.state}: ${freeBytes} bytes free`);
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
