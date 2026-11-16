import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { toAccountLocale } from '../../common/schemas/common.schemas.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CruisingProfile } from '../../generated/prisma/client.js';
import { CruisingMediaRepository } from './cruising-media.repository.js';
import { CruisingNotificationsService } from './cruising-notifications.service.js';
import { CruisingPushService } from './cruising-push.service.js';
import { isSuspended } from './cruising.rules.js';
import { CruisingRepository } from './cruising.repository.js';

export interface AlbumGrantView {
  nickname: string;
  at: string;
}

/**
 * The private album shared per person (architecture 4.15, phase 6, decision 99): from a
 * conversation, a member shares their private album with the other person and can revoke it at any
 * time; a block or leaving the conversation revokes it (CruisingRepository does that with them).
 */
@Injectable()
export class CruisingAlbumService implements OnApplicationShutdown {
  private readonly logger = new Logger(CruisingAlbumService.name);
  private readonly pending = new Set<Promise<unknown>>();

  constructor(
    private readonly media: CruisingMediaRepository,
    private readonly repository: CruisingRepository,
    private readonly push: CruisingPushService,
    private readonly config: AppConfigService,
    private readonly notifications: CruisingNotificationsService,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    await this.settled();
  }

  /** Waits for the notifications still being sent (tests and shutdown). */
  async settled(): Promise<void> {
    while (this.pending.size > 0) await Promise.all(this.pending);
  }

  private async entered(userId: string): Promise<CruisingProfile> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || profile.termsVersion !== this.config.cruisingTermsVersion) {
      throw new ForbiddenException('Confirm your age and accept the rules first');
    }
    return profile;
  }

  /**
   * Shares my private album with the member I have a conversation with. 404 when they are unknown,
   * suspended, blocked either way or there is no conversation between us. Sharing again changes
   * nothing; only a new grant tells them.
   */
  async share(userId: string, nickname: string, now = new Date()): Promise<void> {
    const me = await this.entered(userId);
    if (isSuspended(me, now)) throw new ForbiddenException('Your account is suspended');
    if (!me.nickname) throw new ConflictException('Choose a nickname first');
    const target = await this.repository.findProfileByNickname(nickname);
    if (target?.userId === userId) {
      throw new BadRequestException('You cannot share your album with yourself');
    }
    if (
      !target ||
      isSuspended(target, now) ||
      (await this.repository.hiddenIds(userId)).includes(target.userId)
    ) {
      throw new NotFoundException('Member not found');
    }
    const conversation = await this.repository.findConversationBetween(userId, target.userId);
    if (!conversation) {
      throw new NotFoundException('Start a conversation with this member first');
    }
    if (await this.media.grant(userId, target.userId, now)) {
      this.later(() => this.notifyGrantee(target.userId, conversation.id, now));
    }
  }

  /** Revokes my private album from a member (nothing shared is fine). */
  async revoke(userId: string, nickname: string): Promise<void> {
    await this.entered(userId);
    const target = await this.repository.findProfileByNickname(nickname);
    if (!target) throw new NotFoundException('Member not found');
    await this.media.revoke(userId, target.userId);
  }

  /**
   * Who I shared my private album with, and who shared theirs with me (suspended owners left out:
   * their media can't be seen meanwhile).
   */
  async grants(
    userId: string,
    now = new Date(),
  ): Promise<{ given: AlbumGrantView[]; received: AlbumGrantView[] }> {
    await this.entered(userId);
    const [given, received] = await this.media.grantsOf(userId);
    return {
      given: given.flatMap((row) => {
        const nickname = row.grantee.cruisingProfile?.nickname;
        return nickname ? [{ nickname, at: row.createdAt.toISOString() }] : [];
      }),
      received: received.flatMap((row) => {
        const profile = row.owner.cruisingProfile;
        return profile?.nickname && !isSuspended(profile, now)
          ? [{ nickname: profile.nickname, at: row.createdAt.toISOString() }]
          : [];
      }),
    };
  }

  /**
   * Tells the grantee: an entry in the notification centre (decision 98, opening the conversation)
   * and "Someone shared their private album with you" on their devices (no name).
   */
  private async notifyGrantee(granteeId: string, conversationId: string, now: Date): Promise<void> {
    const user = await this.repository.recipient(granteeId);
    if (!user || isSuspended(user.cruisingProfile, now)) return;
    await this.notifications.notify(granteeId, 'ALBUM_SHARED', { conversationId }, now);
    if (!this.push.enabled) return;
    await this.push.notify('album', [{ userId: granteeId, locale: toAccountLocale(user.locale) }]);
  }

  private later(work: () => Promise<unknown>): void {
    const task: Promise<unknown> = Promise.resolve()
      .then(work)
      .catch((error: unknown) => {
        this.logger.error(`Cruising album notification failed: ${String(error)}`);
      })
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
  }
}
