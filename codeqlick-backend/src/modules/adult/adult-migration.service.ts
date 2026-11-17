import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service.js';
import type { AdultApp } from '../../generated/prisma/client.js';
import { CruisingMediaStorage } from '../cruising/cruising-media.storage.js';
import type { PrivateFileStorage } from '../media/private-storage.js';
import { SwipeStorage, VideochatPhotoStorage } from '../swipe/swipe.storage.js';
import { AdultRepository } from './adult.repository.js';
import { ADULT_APPS } from './adult.rules.js';
import { AdultSafetyService } from './adult-safety.service.js';
import { AdultVerificationStorage } from './adult.storage.js';

/** Pairs whose block side effects run per batch. */
const PAIR_BATCH = 500;
/** First run two minutes after start (the API is up and serving by then). */
const FIRST_RUN_MS = 2 * 60_000;

/**
 * Phase 1's one-off task (architecture 4.16, "Migration"): after the Prisma migration copied the
 * blocks and built the verifications, it moves the verification photo each verification keeps
 * into the shared folder, deletes every other per-app verification photo (nobody is emailed), and
 * runs once the side effects of the blocks now shared, in batches of 500. Idempotent: what is done
 * is never found again, so running it at every start costs a few queries.
 */
@Injectable()
export class AdultMigrationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AdultMigrationService.name);
  private timer: NodeJS.Timeout | undefined;
  private readonly legacy: Record<AdultApp, PrivateFileStorage>;

  constructor(
    private readonly repository: AdultRepository,
    private readonly safety: AdultSafetyService,
    private readonly storage: AdultVerificationStorage,
    private readonly config: AppConfigService,
    cruisingStorage: CruisingMediaStorage,
    swipeStorage: SwipeStorage,
    videochatStorage: VideochatPhotoStorage,
  ) {
    this.legacy = { CRUISING: cruisingStorage, SWIPE: swipeStorage, VIDEOCHAT: videochatStorage };
  }

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setTimeout(() => void this.run(), FIRST_RUN_MS).unref();
  }

  onApplicationShutdown(): void {
    clearTimeout(this.timer);
  }

  /** Both parts; never throws. Returns what it did. */
  async run(): Promise<{ photos: number; deleted: number; pairs: number }> {
    const result = { photos: 0, deleted: 0, pairs: 0 };
    try {
      Object.assign(result, await this.movePhotos());
      result.pairs = await this.clearBlockedPairs();
      if (result.photos + result.deleted + result.pairs > 0) {
        this.logger.log(
          `18+ apps migration: ${result.photos} photos moved, ${result.deleted} deleted, ${result.pairs} blocked pairs cleared`,
        );
      }
    } catch (error) {
      this.logger.error(`18+ apps migration failed: ${String(error)}`);
    }
    return result;
  }

  /**
   * The photo a verification keeps (Swipe's approved one, or the pending one from its source app)
   * moves to the shared folder; every other per-app verification photo is deleted.
   */
  private async movePhotos(): Promise<{ photos: number; deleted: number }> {
    const keys = await this.repository.legacyVerificationKeys();
    let photos = 0;
    for (const row of await this.repository.verificationsWithoutPhoto()) {
      const app = row.sourceApp as AdultApp;
      const key = keys[app].get(row.userId);
      if (!key) continue;
      const data = await this.legacy[app].readAll(key);
      if (!data) continue;
      await this.repository.setPhotoKey(row.userId, await this.storage.write(data));
      photos += 1;
    }
    let deleted = 0;
    for (const app of ADULT_APPS) {
      for (const [userId, key] of keys[app]) {
        await this.repository.clearLegacyVerificationKey(app, userId);
        await this.legacy[app].remove(key);
        deleted += 1;
      }
    }
    return { photos, deleted: deleted - photos };
  }

  /** Deletes what the shared blocks end between two people, in batches of 500 pairs. */
  private async clearBlockedPairs(): Promise<number> {
    let cleared = 0;
    for (;;) {
      const pairs = await this.repository.blockedPairsToClear(PAIR_BATCH);
      if (pairs.length === 0) return cleared;
      await this.repository.transaction(async (db) => {
        for (const { a, b } of pairs) {
          for (const app of ADULT_APPS) await this.safety.stores[app].clearBetween(db, a, b);
        }
      });
      cleared += pairs.length;
      if (pairs.length < PAIR_BATCH) return cleared;
    }
  }
}
