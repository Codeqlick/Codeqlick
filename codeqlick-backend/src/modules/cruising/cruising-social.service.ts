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
import { CruisingPushService } from './cruising-push.service.js';
import {
  ageFromBirthYear,
  ALERT_DAY_MS,
  ALERT_KEEP_MS,
  alertChannel,
  checkInEnd,
  contactStillBlocked,
  isSuspended,
  isUniqueViolation,
  MAX_FAVORITES,
  MAX_PUSH_SUBSCRIPTIONS,
  type AlertChannel,
  type Bbox,
  type RecentAlert,
} from './cruising.rules.js';
import {
  checkInHourSlots,
  contributorBadges,
  HOURS_DECAY,
  HOURS_DECAY_EVERY_MS,
  spotTimeZone,
  type ContributorBadge,
  type ContributorCounters,
} from './cruising-insights.rules.js';
import { CruisingMediaRepository, type MemberBadge } from './cruising-media.repository.js';
import { CruisingRepository } from './cruising.repository.js';
import { badgeFor, countersOf } from './cruising.service.js';
import {
  CHECK_INS_PER_DAY,
  CONVERSATIONS_PER_DAY,
  MAX_ACTIVE_IN_BOX,
  SAFE_CHAT_MESSAGES,
  type CheckInInput,
  type LookingFor,
  type PushSubscriptionInput,
} from './cruising.schemas.js';
import { spotSummary, type CruisingSpotSummary } from './cruising.service.js';

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
  members: ({ nickname: string; since: string } & MemberBadge)[];
}

export interface CruisingMember {
  nickname: string;
  bio: string;
  country: string | null;
  lookingFor: LookingFor[];
  /** Null unless the member shows it. */
  age: number | null;
  memberSince: string;
  /** Phase 4: the "Verified" badge and the cover photo. */
  verified: boolean;
  coverId: string | null;
  /** Phase 5 (decision 93): the contributor badges and the counters they come from. */
  badges: ContributorBadge[];
  contributions: ContributorCounters;
}

export interface CruisingConversationView {
  id: string;
  partner: { nickname: string } & MemberBadge;
  lastMessage: { text: string; mine: boolean; at: string } | null;
  unread: number;
  createdAt: string;
}

export interface CruisingFavoriteView {
  spot: CruisingSpotSummary;
  /** How many are there now, counted like the spot's presence. */
  here: number;
  savedAt: string;
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
  /** Alerts and pushes still being sent after their request answered. */
  private readonly pending = new Set<Promise<unknown>>();

  constructor(
    private readonly repository: CruisingRepository,
    private readonly mediaRepository: CruisingMediaRepository,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly push: CruisingPushService,
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

  /** Runs `work` after the request has answered: its errors are logged, never thrown. */
  private later(work: () => Promise<unknown>, what: string): void {
    const task: Promise<unknown> = Promise.resolve()
      .then(work)
      .catch((error: unknown) => {
        this.logger.error(`Cruising ${what} failed: ${String(error)}`);
      })
      .finally(() => this.pending.delete(task));
    this.pending.add(task);
  }

  /** Waits for the alerts and pushes still being sent (for tests). */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all(this.pending);
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
      // Nicknames left more than 14 days ago are free again and no longer count (decision 83).
      await this.repository.deleteNicknameChangesBefore(new Date(now.getTime() - 14 * DAY_MS));
      // Alerts only count for a day; they are kept two (decision 85).
      await this.repository.deleteAlertsBefore(new Date(now.getTime() - ALERT_KEEP_MS));
      // The busiest hours fade: each spot's weights × 0.98 once a day (decision 89).
      await this.repository.decaySpotHours(
        new Date(now.getTime() - HOURS_DECAY_EVERY_MS),
        HOURS_DECAY,
      );
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
    const badges = await this.mediaRepository.badges([target.userId], now);
    return {
      ...badgeFor(badges, target.userId, true),
      nickname: target.nickname as string,
      bio: target.bio,
      country: target.country,
      lookingFor: target.lookingFor,
      age: target.showAge ? ageFromBirthYear(target.birthYear, now) : null,
      memberSince: target.createdAt.toISOString(),
      badges: contributorBadges(countersOf(target)),
      contributions: countersOf(target),
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
    const expiresAt = checkInEnd(input.hours, now);
    // The busiest hours count it in the spot's local time (decision 89): only counters.
    const timeZone = spot.timeZone ?? spotTimeZone(Number(spot.lat), Number(spot.lng));
    const checkIn = await this.repository.createCheckIn(
      userId,
      spot.id,
      input.anonymous,
      expiresAt,
      now,
      { slots: checkInHourSlots(now, expiresAt, timeZone), timeZone },
    );
    // The members who saved the spot hear about it after the answer (an anonymous one too).
    this.later(() => this.alertFavorites(spot.id, userId, now), 'favourite alerts');
    return this.checkInView(checkIn);
  }

  /**
   * Tells the members who saved `spotId` that someone is there, never who (decision 85): not the
   * person checking in, nobody blocked either way, no suspended member; at most once per member
   * and spot every 3 hours and 10 times a day, by push or, without a device, the daily email.
   * Returns how many were alerted.
   */
  async alertFavorites(spotId: string, checkerId: string, now = new Date()): Promise<number> {
    const hidden = await this.repository.hiddenIds(checkerId);
    const candidates = await this.repository.favoriteAlertCandidates(
      spotId,
      [checkerId, ...hidden],
      this.config.cruisingTermsVersion,
      now,
    );
    if (candidates.length === 0) return 0;
    const recent = new Map<string, RecentAlert[]>();
    const since = new Date(now.getTime() - ALERT_DAY_MS);
    for (const alert of await this.repository.recentAlerts(
      candidates.map((row) => row.userId),
      since,
    )) {
      recent.set(alert.userId, [...(recent.get(alert.userId) ?? []), alert]);
    }
    const pushEnabled = this.push.enabled;
    const alerts: { userId: string; spotId: string; channel: AlertChannel; createdAt: Date }[] = [];
    const pushTo: { userId: string; locale: 'en' | 'es' }[] = [];
    const emailTo: { email: string; locale: 'en' | 'es' }[] = [];
    for (const row of candidates) {
      const profile = row.user.cruisingProfile;
      if (!profile) continue;
      const channel = alertChannel(
        {
          favoriteAlerts: profile.favoriteAlerts,
          favoriteEmails: profile.favoriteEmails,
          emailAlerts: profile.emailAlerts,
          hasPush: pushEnabled && row.user._count.cruisingPushSubscriptions > 0,
        },
        spotId,
        recent.get(row.userId) ?? [],
        now,
      );
      if (!channel) continue;
      const locale = toApiLocale(row.user.locale);
      alerts.push({ userId: row.userId, spotId, channel, createdAt: now });
      if (channel === 'PUSH') pushTo.push({ userId: row.userId, locale });
      else emailTo.push({ email: row.user.email, locale });
    }
    await this.repository.createAlerts(alerts);
    for (const to of emailTo) {
      this.mail
        .send(
          cruisingNoticeEmail(
            to.email,
            to.locale,
            'favorites',
            null,
            this.config.webappUrl('cruising'),
            this.config.siteUrl,
          ),
        )
        .catch((error: unknown) => {
          this.logger.error(`Cruising email not sent: ${String(error)}`);
        });
    }
    await this.push.notify('favorite', pushTo);
    return alerts.length;
  }

  /** Ends my check-in (nothing to end is fine). */
  async endCheckIn(userId: string, now = new Date()): Promise<void> {
    await this.entered(userId);
    await this.repository.endCheckIns(userId, now);
  }

  /** Who is at a LIVE spot now: the count, and the nicknames of the non-anonymous. */
  async presence(userId: string, spotId: string, now = new Date()): Promise<CruisingPresence> {
    const me = await this.entered(userId);
    const spot = await this.repository.findSpot(spotId);
    if (!spot || spot.status !== 'LIVE') throw new NotFoundException('Spot not found');
    const hidden = await this.repository.hiddenIds(userId);
    const rows = await this.repository.presence(spot.id, now, hidden);
    const named = rows.filter((row) => !row.anonymous && row.user.cruisingProfile?.nickname);
    const badges = await this.mediaRepository.badges(
      named.map((row) => row.user.id),
      now,
    );
    return {
      count: rows.length,
      members: named.map((row) => ({
        nickname: row.user.cruisingProfile?.nickname as string,
        since: row.createdAt.toISOString(),
        ...badgeFor(badges, row.user.id, !!me.nickname),
      })),
    };
  }

  /**
   * The LIVE spots of a box of the map with someone there now (phase 3, decision 86), counted like
   * a spot's presence. Only for entered members: presence never leaves the members' area.
   */
  async active(
    userId: string,
    box: Bbox,
    now = new Date(),
  ): Promise<{ items: { spotId: string; here: number }[] }> {
    await this.entered(userId);
    const hidden = await this.repository.hiddenIds(userId);
    return { items: await this.repository.activeInBox(box, now, hidden, MAX_ACTIVE_IN_BOX) };
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
    const me = await this.entered(userId);
    const rows = await this.repository.conversationsOf(userId);
    const badges = await this.mediaRepository.badges(
      rows.map((row) => (row.userAId === userId ? row.userBId : row.userAId)),
    );
    return Promise.all(
      rows.map(async (row): Promise<CruisingConversationView> => {
        const isA = row.userAId === userId;
        const partner = isA ? row.userB : row.userA;
        const partnerId = isA ? row.userBId : row.userAId;
        const last = row.messages[0];
        return {
          id: row.id,
          partner: {
            nickname: partner.cruisingProfile?.nickname ?? '—',
            ...badgeFor(badges, partnerId, !!me.nickname),
          },
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
    // The other person's devices hear about it at once; the unread email still follows later.
    this.later(() => this.pushMessage(partnerId, userId, now), 'message push');
    return {
      id: message.id,
      mine: true,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
    };
  }

  /** "New message" on the recipient's devices, unless suspended or blocked either way. */
  private async pushMessage(recipientId: string, senderId: string, now: Date): Promise<void> {
    if (!this.push.enabled) return;
    const user = await this.repository.recipient(recipientId);
    if (!user || isSuspended(user.cruisingProfile, now)) return;
    if ((await this.repository.hiddenIds(senderId)).includes(recipientId)) return;
    await this.push.notify('message', [{ userId: recipientId, locale: toApiLocale(user.locale) }]);
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

  // ---- Favourites (phase 3, decision 85) ---------------------------------------------------------

  /** My favourites whose spot is LIVE, newest first, with how many are there now. */
  async favorites(userId: string, now = new Date()): Promise<{ items: CruisingFavoriteView[] }> {
    await this.entered(userId);
    const rows = await this.repository.favorites(userId, MAX_FAVORITES);
    const hidden = await this.repository.hiddenIds(userId);
    const here = await this.repository.hereAt(
      rows.map((row) => row.spot.id),
      now,
      hidden,
    );
    return {
      items: rows.map((row) => ({
        spot: spotSummary(row.spot),
        here: here.get(row.spot.id) ?? 0,
        savedAt: row.createdAt.toISOString(),
      })),
    };
  }

  /** Saves a LIVE spot (up to 100); saving one already saved changes nothing. */
  async saveFavorite(userId: string, spotId: string, now = new Date()): Promise<void> {
    await this.entered(userId);
    const spot = await this.repository.findSpot(spotId);
    if (!spot || spot.status !== 'LIVE') throw new NotFoundException('Spot not found');
    if (await this.repository.isFavorite(userId, spot.id)) return;
    if ((await this.repository.countFavorites(userId)) >= MAX_FAVORITES) {
      throw new ConflictException(`You can save up to ${MAX_FAVORITES} favourite spots`);
    }
    await this.repository.addFavorite(userId, spot.id, now);
  }

  /** Removes a favourite (one that isn't saved is fine). */
  async removeFavorite(userId: string, spotId: string): Promise<void> {
    await this.entered(userId);
    await this.repository.removeFavorite(userId, spotId);
  }

  // ---- Notifications on this device (phase 3, decision 85) ---------------------------------------

  /** Stores this device's push subscription (up to 5 a member; the oldest goes). */
  async subscribePush(
    userId: string,
    input: PushSubscriptionInput,
    now = new Date(),
  ): Promise<void> {
    if (!this.push.enabled) throw new ConflictException('Notifications are not available');
    await this.entered(userId);
    await this.repository.savePushSubscription(
      userId,
      { endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth },
      MAX_PUSH_SUBSCRIPTIONS,
      now,
    );
  }

  /** Forgets this device's subscription (an unknown one is fine). */
  async unsubscribePush(userId: string, endpoint: string): Promise<void> {
    await this.repository.deletePushSubscription(endpoint, userId);
  }
}
