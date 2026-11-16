import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CruisingProfile } from '../../generated/prisma/client.js';
import { CruisingMediaRepository } from './cruising-media.repository.js';
import { CruisingNotificationsRepository } from './cruising-notifications.repository.js';
import {
  DAY_MS,
  MAX_VISITORS,
  MAX_WINKS_SHOWN,
  recordsVisit,
  utcDay,
  VISIT_KEEP_MS,
  WINK_KEEP_MS,
  WINKS_PER_DAY,
  winkOutcome,
} from './cruising-notifications.rules.js';
import { CruisingNotificationsService } from './cruising-notifications.service.js';
import { CruisingPushService } from './cruising-push.service.js';
import { isSuspended } from './cruising.rules.js';
import { CruisingRepository } from './cruising.repository.js';

export interface CruisingWinkView {
  nickname: string;
  verified: boolean;
  at: string;
  /** I winked back (in the last 30 days). */
  mutual: boolean;
}

export interface CruisingVisitorView {
  nickname: string;
  verified: boolean;
  at: string;
}

type Person = {
  cruisingProfile: {
    nickname: string | null;
    suspendedAt: Date | null;
    suspendedUntil: Date | null;
    termsVersion: string;
  } | null;
};

/**
 * Winks and profile visits (architecture 4.15, decision 97). A wink tells its recipient that
 * someone winked, never who, outside the app; visits are reciprocal and off by default.
 */
@Injectable()
export class CruisingWinksService {
  private readonly logger = new Logger(CruisingWinksService.name);

  constructor(
    private readonly winksRepository: CruisingNotificationsRepository,
    private readonly repository: CruisingRepository,
    private readonly mediaRepository: CruisingMediaRepository,
    private readonly notifications: CruisingNotificationsService,
    private readonly push: CruisingPushService,
    private readonly config: AppConfigService,
  ) {}

  private async entered(userId: string): Promise<CruisingProfile> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || profile.termsVersion !== this.config.cruisingTermsVersion) {
      throw new ForbiddenException('Confirm your age and accept the rules first');
    }
    return profile;
  }

  /** Someone listed by nickname: entered with the current rules, a nickname, not suspended. */
  private shown(person: Person, now: Date): string | null {
    const profile = person.cruisingProfile;
    if (!profile?.nickname || isSuspended(profile, now)) return null;
    if (profile.termsVersion !== this.config.cruisingTermsVersion) return null;
    return profile.nickname;
  }

  // ---- Winks -------------------------------------------------------------------------------------

  /** Winks at a member: one per pair a day (a second changes nothing), 30 a day. */
  async wink(userId: string, nickname: string, now = new Date()): Promise<void> {
    const me = await this.entered(userId);
    if (isSuspended(me, now)) throw new ForbiddenException('Your account is suspended');
    if (!me.nickname) throw new ConflictException('Choose a nickname first');
    const target = await this.repository.findProfileByNickname(nickname);
    if (!target || isSuspended(target, now)) throw new NotFoundException('Member not found');
    if (target.userId === userId) throw new BadRequestException('You cannot wink at yourself');
    if ((await this.repository.hiddenIds(userId)).includes(target.userId)) {
      throw new NotFoundException('Member not found');
    }
    const since = new Date(now.getTime() - DAY_MS);
    const outcome = winkOutcome(
      await this.winksRepository.countWinksSince(userId, since),
      await this.winksRepository.winkedSince(userId, target.userId, since),
    );
    if (outcome === 'already') return;
    if (outcome === 'limit') {
      throw new HttpException(
        `You can wink ${WINKS_PER_DAY} times a day`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.winksRepository.createWink(userId, target.userId, now);
    await this.notifications.notify(target.userId, 'WINK', { count: 1 }, now);
    await this.pushWink(target.userId);
  }

  /** "Someone winked at you" on the recipient's devices: nothing more. */
  private async pushWink(recipientId: string): Promise<void> {
    if (!this.push.enabled) return;
    try {
      const user = await this.repository.recipient(recipientId);
      if (!user) return;
      await this.push.notify('wink', [{ userId: recipientId, locale: toApiLocale(user.locale) }]);
    } catch (error) {
      this.logger.error(`Cruising wink push failed: ${String(error)}`);
    }
  }

  /** Whether I winked at this member in the last day (the profile's button). */
  async winkedToday(userId: string, targetId: string, now = new Date()): Promise<boolean> {
    return this.winksRepository.winkedSince(userId, targetId, new Date(now.getTime() - DAY_MS));
  }

  /** The winks I received (the latest from each member), newest first. */
  async winks(userId: string, now = new Date()): Promise<{ items: CruisingWinkView[] }> {
    await this.entered(userId);
    const since = new Date(now.getTime() - WINK_KEEP_MS);
    const hidden = await this.repository.hiddenIds(userId);
    const rows = await this.winksRepository.winksReceived(userId, since, hidden, 500);
    const seen = new Set<string>();
    const latest: { userId: string; nickname: string; at: Date }[] = [];
    for (const row of rows) {
      if (seen.has(row.senderId)) continue;
      seen.add(row.senderId);
      const nickname = this.shown(row.sender, now);
      if (nickname) latest.push({ userId: row.senderId, nickname, at: row.createdAt });
      if (latest.length >= MAX_WINKS_SHOWN) break;
    }
    const ids = latest.map((row) => row.userId);
    const [badges, back] = await Promise.all([
      this.mediaRepository.badges(ids, now),
      this.winksRepository.winkedAt(userId, ids, since),
    ]);
    return {
      items: latest.map((row) => ({
        nickname: row.nickname,
        verified: badges.get(row.userId)?.verified ?? false,
        at: row.at.toISOString(),
        mutual: back.has(row.userId),
      })),
    };
  }

  // ---- Profile visits ----------------------------------------------------------------------------

  /**
   * Records that `viewer` opened `viewed`'s profile when both turned visits on (one row a day); the
   * first visit of the day adds to the day's "visits" notification. Never throws.
   */
  async recordVisit(
    viewer: Pick<CruisingProfile, 'userId' | 'showVisits'>,
    viewed: Pick<CruisingProfile, 'userId' | 'showVisits'>,
    now = new Date(),
  ): Promise<void> {
    if (!recordsVisit(viewer, viewed)) return;
    try {
      const first = await this.winksRepository.recordView(
        viewer.userId,
        viewed.userId,
        utcDay(now),
        now,
      );
      if (first) await this.notifications.notify(viewed.userId, 'VISITS', { count: 1 }, now);
    } catch (error) {
      this.logger.error(`Cruising visit not recorded: ${String(error)}`);
    }
  }

  /** Who opened my profile (the latest visit of each, the last 100), only with visits on. */
  async visitors(
    userId: string,
    now = new Date(),
  ): Promise<{ showVisits: boolean; items: CruisingVisitorView[] }> {
    const me = await this.entered(userId);
    if (!me.showVisits) return { showVisits: false, items: [] };
    const hidden = await this.repository.hiddenIds(userId);
    const rows = await this.winksRepository.visitors(
      userId,
      new Date(now.getTime() - VISIT_KEEP_MS),
      hidden,
      MAX_VISITORS * 5,
    );
    const seen = new Set<string>();
    const latest: { userId: string; nickname: string; at: Date }[] = [];
    for (const row of rows) {
      if (seen.has(row.viewerId)) continue;
      seen.add(row.viewerId);
      const nickname = this.shown(row.viewer, now);
      if (nickname) latest.push({ userId: row.viewerId, nickname, at: row.seenAt });
      if (latest.length >= MAX_VISITORS) break;
    }
    const badges = await this.mediaRepository.badges(
      latest.map((row) => row.userId),
      now,
    );
    return {
      showVisits: true,
      items: latest.map((row) => ({
        nickname: row.nickname,
        verified: badges.get(row.userId)?.verified ?? false,
        at: row.at.toISOString(),
      })),
    };
  }

  /** Turns visits on or off; off deletes my visits both ways and their notifications. */
  async setShowVisits(userId: string, showVisits: boolean): Promise<{ showVisits: boolean }> {
    await this.entered(userId);
    await this.winksRepository.setShowVisits(userId, showVisits);
    if (!showVisits) {
      await this.winksRepository.deleteViewsOf(userId);
      await this.winksRepository.deleteNotificationsOfKind(userId, 'VISITS');
    }
    return { showVisits };
  }
}
