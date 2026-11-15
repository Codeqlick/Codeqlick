import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CruisingProfile } from '../../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { sharesContact } from '../swipe/swipe-chat-guard.js';
import { cruisingNoticeEmail } from './cruising-emails.js';
import {
  ageFromBirthYear,
  checkInEnd,
  contactStillBlocked,
  isSuspended,
  isUniqueViolation,
} from './cruising.rules.js';
import { CruisingRepository } from './cruising.repository.js';
import {
  CHECK_INS_PER_DAY,
  CONVERSATIONS_PER_DAY,
  SAFE_CHAT_MESSAGES,
  type CheckInInput,
  type LookingFor,
} from './cruising.schemas.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Unread messages are emailed once they have waited this long… */
const UNREAD_AFTER_MS = 15 * 60 * 1000;
/** …checked this often, for conversations active in the last week. */
const UNREAD_EVERY_MS = 10 * 60 * 1000;
const UNREAD_LOOKBACK_MS = 7 * DAY_MS;
/** The unread scan reads candidates in pages of this size, up to this many pages a run. */
const UNREAD_PAGE = 500;
const UNREAD_MAX_PAGES = 200;
/** Check-ins are deleted once they expired this long ago, checked every hour. */
const CHECK_IN_KEEP_MS = DAY_MS;
const CLEANUP_EVERY_MS = 60 * 60 * 1000;

export interface CruisingCheckInView {
  spot: { id: string; slug: string; name: string };
  anonymous: boolean;
  expiresAt: string;
}

export interface CruisingPresence {
  /** Everyone checked in now, anonymous ones and me included. */
  count: number;
  /** Only the non-anonymous ones. */
  members: { nickname: string; since: string }[];
}

export interface CruisingMember {
  nickname: string;
  bio: string;
  country: string | null;
  lookingFor: LookingFor[];
  /** Null unless the member shows it. */
  age: number | null;
  memberSince: string;
}

export interface CruisingConversationView {
  id: string;
  partner: { nickname: string };
  lastMessage: { text: string; mine: boolean; at: string } | null;
  unread: number;
  createdAt: string;
}

export interface CruisingMessageView {
  id: string;
  mine: boolean;
  text: string;
  createdAt: string;
}

/**
 * Cruising's members' network (architecture 4.15, phase 2): profiles, check-ins and who is here,
 * conversations and messages, blocks. Its emails never carry a nickname, a spot or a message.
 */
@Injectable()
export class CruisingSocialService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CruisingSocialService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly repository: CruisingRepository,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timers.push(
      setInterval(() => void this.emailUnread(), UNREAD_EVERY_MS).unref(),
      setInterval(() => void this.cleanupCheckIns(), CLEANUP_EVERY_MS).unref(),
    );
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers) clearInterval(timer);
  }

  // ---- Background --------------------------------------------------------------------------------

  /** Emails each member whose conversation's messages have waited unread (once until they read). */
  async emailUnread(now = new Date()): Promise<number> {
    let sent = 0;
    try {
      // Page through every candidate: with many conversations, none may be left out.
      const conversations = [];
      for (let cursor: string | undefined, page = 0; page < UNREAD_MAX_PAGES; page += 1) {
        const batch = await this.repository.recentlyActiveConversations(
          new Date(now.getTime() - UNREAD_LOOKBACK_MS),
          new Date(now.getTime() - UNREAD_AFTER_MS),
          cursor,
          UNREAD_PAGE,
        );
        conversations.push(...batch);
        if (batch.length < UNREAD_PAGE) break;
        cursor = batch.at(-1)?.id;
      }
      for (const conversation of conversations) {
        const sender = conversation.messages[0]?.senderId;
        if (!sender || !conversation.lastMessageAt) continue;
        const reader =
          sender === conversation.userAId ? conversation.userBId : conversation.userAId;
        const isA = reader === conversation.userAId;
        const readAt = isA ? conversation.readAAt : conversation.readBAt;
        const notifiedAt = isA ? conversation.notifiedAAt : conversation.notifiedBAt;
        if (readAt && readAt >= conversation.lastMessageAt) continue;
        // Told already, and they haven't read since.
        if (notifiedAt && (!readAt || notifiedAt > readAt)) continue;
        await this.repository.markNotified(conversation, reader, now);
        if (await this.notifyUnread(reader, now)) sent += 1;
      }
    } catch (error) {
      this.logger.error(`Cruising unread emails failed: ${String(error)}`);
    }
    return sent;
  }

  /** The email says nothing but "you have an unread message": no nickname, spot or text. */
  private async notifyUnread(userId: string, now: Date): Promise<boolean> {
    try {
      const user = await this.repository.recipient(userId);
      if (!user || isSuspended(user.cruisingProfile, now)) return false;
      if (user.cruisingProfile?.emailAlerts === false) return false;
      this.mail
        .send(
          cruisingNoticeEmail(
            user.email,
            toApiLocale(user.locale),
            'unread',
            null,
            this.config.webappUrl('cruising'),
            this.config.siteUrl,
          ),
        )
        .catch((error: unknown) => {
          this.logger.error(`Cruising email not sent: ${String(error)}`);
        });
      return true;
    } catch (error) {
      this.logger.error(`Cruising notice not sent: ${String(error)}`);
      return false;
    }
  }

  /** Deletes the check-ins that expired more than 24 hours ago. */
  async cleanupCheckIns(now = new Date()): Promise<number> {
    try {
      // Conversation starts older than a day no longer count toward the daily limit.
      await this.repository.deleteConversationStartsBefore(new Date(now.getTime() - DAY_MS));
      // Nicknames left more than 14 days ago are free again and no longer count (decision 82).
      await this.repository.deleteNicknameChangesBefore(new Date(now.getTime() - 14 * DAY_MS));
      return await this.repository.deleteCheckInsExpiredBefore(
        new Date(now.getTime() - CHECK_IN_KEEP_MS),
      );
    } catch (error) {
      this.logger.error(`Cruising check-in cleanup failed: ${String(error)}`);
      return 0;
    }
  }

  // ---- Who may do what ---------------------------------------------------------------------------

  /** A member who has entered with the current rules (a suspended one can still read). */
  private async entered(userId: string): Promise<CruisingProfile> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || profile.termsVersion !== this.config.cruisingTermsVersion) {
      throw new ForbiddenException('Confirm your age and accept the rules first');
    }
    return profile;
  }

  /** A member who may check in and write now. */
  private async allowed(userId: string, now: Date): Promise<CruisingProfile> {
    const profile = await this.entered(userId);
    if (isSuspended(profile, now)) throw new ForbiddenException('Your account is suspended');
    return profile;
  }

  /** Check-ins and messages need a nickname. */
  private needNickname(profile: CruisingProfile): void {
    if (!profile.nickname) throw new ConflictException('Choose a nickname first');
  }

  /** A member by nickname, unless unknown, suspended or hidden by a block either way. */
  private async visible(userId: string, nickname: string, now: Date): Promise<CruisingProfile> {
    const target = await this.repository.findProfileByNickname(nickname);
    if (!target || isSuspended(target, now)) throw new NotFoundException('Member not found');
    if (
      target.userId !== userId &&
      (await this.repository.hiddenIds(userId)).includes(target.userId)
    ) {
      throw new NotFoundException('Member not found');
    }
    return target;
  }

  // ---- Profiles ----------------------------------------------------------------------------------

  async member(userId: string, nickname: string, now = new Date()): Promise<CruisingMember> {
    this.needNickname(await this.entered(userId));
    const target = await this.visible(userId, nickname, now);
    return {
      nickname: target.nickname as string,
      bio: target.bio,
      country: target.country,
      lookingFor: target.lookingFor,
      age: target.showAge ? ageFromBirthYear(target.birthYear, now) : null,
      memberSince: target.createdAt.toISOString(),
    };
  }

  // ---- Check-ins ---------------------------------------------------------------------------------

  private checkInView(checkIn: {
    spot: { id: string; slug: string; name: string };
    anonymous: boolean;
    expiresAt: Date;
  }): CruisingCheckInView {
    return {
      spot: { id: checkIn.spot.id, slug: checkIn.spot.slug, name: checkIn.spot.name },
      anonymous: checkIn.anonymous,
      expiresAt: checkIn.expiresAt.toISOString(),
    };
  }

  /** My active check-in, or null. */
  async myCheckIn(userId: string, now = new Date()): Promise<CruisingCheckInView | null> {
    await this.entered(userId);
    const checkIn = await this.repository.activeCheckIn(userId, now);
    return checkIn ? this.checkInView(checkIn) : null;
  }

  /** "I'm here" at a LIVE spot for 1 to 3 hours: ends my previous check-in (10 a day). */
  async checkIn(
    userId: string,
    input: CheckInInput,
    now = new Date(),
  ): Promise<CruisingCheckInView> {
    const me = await this.allowed(userId, now);
    this.needNickname(me);
    const spot = await this.repository.findSpot(input.spotId);
    if (!spot || spot.status !== 'LIVE') throw new NotFoundException('Spot not found');
    const today = await this.repository.countCheckInsSince(
      userId,
      new Date(now.getTime() - DAY_MS),
    );
    if (today >= CHECK_INS_PER_DAY) {
      throw new HttpException('You can check in 10 times a day', HttpStatus.TOO_MANY_REQUESTS);
    }
    const checkIn = await this.repository.createCheckIn(
      userId,
      spot.id,
      input.anonymous,
      checkInEnd(input.hours, now),
      now,
    );
    return this.checkInView(checkIn);
  }

  /** Ends my check-in (nothing to end is fine). */
  async endCheckIn(userId: string, now = new Date()): Promise<void> {
    await this.entered(userId);
    await this.repository.endCheckIns(userId, now);
  }

  /** Who is at a LIVE spot now: the count, and the nicknames of the non-anonymous. */
  async presence(userId: string, spotId: string, now = new Date()): Promise<CruisingPresence> {
    await this.entered(userId);
    const spot = await this.repository.findSpot(spotId);
    if (!spot || spot.status !== 'LIVE') throw new NotFoundException('Spot not found');
    const hidden = await this.repository.hiddenIds(userId);
    const rows = await this.repository.presence(spot.id, now, hidden);
    return {
      count: rows.length,
      members: rows.flatMap((row) => {
        const nickname = row.user.cruisingProfile?.nickname;
        return row.anonymous || !nickname ? [] : [{ nickname, since: row.createdAt.toISOString() }];
      }),
    };
  }

  // ---- Conversations -----------------------------------------------------------------------------

  /** A conversation I am in, and who the other person is; 404 otherwise. */
  private async mine(userId: string, conversationId: string) {
    const conversation = await this.repository.findConversation(conversationId);
    if (!conversation || (conversation.userAId !== userId && conversation.userBId !== userId)) {
      throw new NotFoundException('Conversation not found');
    }
    const partnerId = conversation.userAId === userId ? conversation.userBId : conversation.userAId;
    return { conversation, partnerId };
  }

  /** My conversations, latest first. */
  async conversations(userId: string): Promise<CruisingConversationView[]> {
    await this.entered(userId);
    const rows = await this.repository.conversationsOf(userId);
    return Promise.all(
      rows.map(async (row): Promise<CruisingConversationView> => {
        const isA = row.userAId === userId;
        const partner = isA ? row.userB : row.userA;
        const partnerId = isA ? row.userBId : row.userAId;
        const last = row.messages[0];
        return {
          id: row.id,
          partner: { nickname: partner.cruisingProfile?.nickname ?? '—' },
          lastMessage: last
            ? { text: last.text, mine: last.senderId === userId, at: last.createdAt.toISOString() }
            : null,
          unread: await this.repository.countMessagesFrom(
            row.id,
            partnerId,
            isA ? row.readAAt : row.readBAt,
          ),
          createdAt: row.createdAt.toISOString(),
        };
      }),
    );
  }

  /** Opens the conversation with a member, or returns the one that exists (10 new a day). */
  async openConversation(
    userId: string,
    nickname: string,
    now = new Date(),
  ): Promise<{ id: string; created: boolean }> {
    const me = await this.allowed(userId, now);
    this.needNickname(me);
    const target = await this.visible(userId, nickname, now);
    if (target.userId === userId) throw new BadRequestException('You cannot message yourself');
    const existing = await this.repository.findConversationBetween(userId, target.userId);
    if (existing) return { id: existing.id, created: false };
    const today = await this.repository.countConversationsStartedSince(
      userId,
      new Date(now.getTime() - DAY_MS),
    );
    if (today >= CONVERSATIONS_PER_DAY) {
      throw new HttpException(
        'You can start 10 new conversations a day',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    try {
      const created = await this.repository.createConversation(userId, target.userId);
      return { id: created.id, created: true };
    } catch (error) {
      // Both opened it at the same moment: the other request created it.
      if (!isUniqueViolation(error)) throw error;
      const other = await this.repository.findConversationBetween(userId, target.userId);
      if (!other) throw error;
      return { id: other.id, created: false };
    }
  }

  /** The conversation's messages (after `after`, or the last 100); marks them read. */
  async messages(
    userId: string,
    conversationId: string,
    after: string | undefined,
    now = new Date(),
  ): Promise<CruisingMessageView[]> {
    await this.entered(userId);
    const { conversation } = await this.mine(userId, conversationId);
    const items = await this.repository.messages(
      conversation.id,
      after ? new Date(after) : undefined,
    );
    await this.repository.markRead(conversation, userId, now);
    return items.map((message) => ({
      id: message.id,
      mine: message.senderId === userId,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
    }));
  }

  /**
   * Sends a message. Until each of the two has sent 5, one that shares a phone number, an email, a
   * link or an outside app or handle is refused (scams and spam).
   */
  async sendMessage(
    userId: string,
    conversationId: string,
    text: string,
    now = new Date(),
  ): Promise<CruisingMessageView> {
    const me = await this.allowed(userId, now);
    this.needNickname(me);
    const { conversation, partnerId } = await this.mine(userId, conversationId);
    if (sharesContact(text)) {
      const counts = await this.repository.messageCounts(conversation.id);
      if (
        contactStillBlocked(counts.get(userId) ?? 0, counts.get(partnerId) ?? 0, SAFE_CHAT_MESSAGES)
      ) {
        throw new BadRequestException(
          `For your safety, phone numbers, emails, links and other apps can only be shared once you have both sent ${SAFE_CHAT_MESSAGES} messages`,
        );
      }
    }
    const message = await this.repository.addMessage(conversation, userId, text, now);
    return {
      id: message.id,
      mine: true,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
    };
  }

  /** Leaving a conversation deletes it for both. */
  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    await this.entered(userId);
    const { conversation } = await this.mine(userId, conversationId);
    await this.repository.deleteConversation(conversation.id);
  }

  // ---- Blocks ------------------------------------------------------------------------------------

  /** My blocks, newest first. */
  async blocks(userId: string): Promise<{ items: { nickname: string; createdAt: string }[] }> {
    await this.entered(userId);
    const rows = await this.repository.blocksMade(userId);
    return {
      items: rows.flatMap((row) => {
        const nickname = row.blocked.cruisingProfile?.nickname;
        return nickname ? [{ nickname, createdAt: row.createdAt.toISOString() }] : [];
      }),
    };
  }

  /** Blocks a member both ways and deletes the conversation with them. */
  async block(userId: string, nickname: string): Promise<void> {
    await this.entered(userId);
    const target = await this.repository.findProfileByNickname(nickname);
    if (!target) throw new NotFoundException('Member not found');
    if (target.userId === userId) throw new BadRequestException('You cannot block yourself');
    await this.repository.block(userId, target.userId);
  }

  /** Blocks the other person of a conversation: it is deleted and neither sees the other again. */
  async blockConversation(userId: string, conversationId: string): Promise<void> {
    await this.entered(userId);
    const { partnerId } = await this.mine(userId, conversationId);
    await this.repository.block(userId, partnerId);
  }

  /** Lifts my block. */
  async unblock(userId: string, nickname: string): Promise<void> {
    await this.entered(userId);
    const target = await this.repository.findProfileByNickname(nickname);
    if (!target || !(await this.repository.unblock(userId, target.userId))) {
      throw new NotFoundException('No such block');
    }
  }
}
