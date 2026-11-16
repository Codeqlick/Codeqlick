import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CruisingProfile } from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { CruisingMediaRepository } from './cruising-media.repository.js';
import {
  CruisingRoomsRepository,
  type RoomKey,
  type RoomMessageRow,
} from './cruising-rooms.repository.js';
import {
  isMuted,
  mergeRooms,
  muteUntil,
  roomPostingBlock,
  roomRateAllows,
  roomTextRefusal,
  type RoomPostingBlock,
} from './cruising-rooms.rules.js';
import { isSuspended } from './cruising.rules.js';
import { CruisingRepository } from './cruising.repository.js';
import type { SuspensionDuration } from './cruising.schemas.js';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export interface RoomMessageView {
  id: string;
  nickname: string;
  verified: boolean;
  text: string;
  at: string;
  mine: boolean;
}

export interface RoomPosting {
  allowed: boolean;
  reason: RoomPostingBlock | null;
  /** When a mute or suspension ends (null: no end, or nothing to wait for). */
  until: string | null;
}

export interface RoomListItem {
  countryCode: string;
  citySlug: string;
  city: string;
  lastAt: string | null;
  count24h: number;
}

/** What the API answers for each refusal (decision 100). */
const REFUSALS: Record<RoomPostingBlock, () => HttpException> = {
  nickname: () => new ConflictException('Choose a nickname first'),
  suspended: () => new ForbiddenException('Your account is suspended'),
  muted: () => new ForbiddenException('You were muted from the city rooms'),
  'new-account': () =>
    new ForbiddenException('Accounts can post in city rooms once they are a day old'),
};

/**
 * One chat room per city with LIVE spots (architecture 4.15, phase 6, decision 100): entered
 * members read; those with a nickname, an account over a day old, not muted and not suspended post
 * text (no contact details, no links), 10 a minute and 200 a day. Blocks hide messages both ways;
 * the team deletes messages and mutes members.
 */
@Injectable()
export class CruisingRoomsService {
  constructor(
    private readonly rooms: CruisingRoomsRepository,
    private readonly repository: CruisingRepository,
    private readonly mediaRepository: CruisingMediaRepository,
    private readonly activity: ActivityService,
    private readonly config: AppConfigService,
  ) {}

  private async entered(userId: string): Promise<CruisingProfile> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || profile.termsVersion !== this.config.cruisingTermsVersion) {
      throw new ForbiddenException('Confirm your age and accept the rules first');
    }
    return profile;
  }

  /** The room of a city with LIVE spots; 404 for any other. */
  private async room(room: RoomKey): Promise<string> {
    const city = await this.rooms.roomCity(room);
    if (!city) throw new NotFoundException('Room not found');
    return city;
  }

  /** Whether I may post in rooms now, and why not. */
  private async posting(profile: CruisingProfile, now: Date): Promise<RoomPosting> {
    const createdAt = (await this.rooms.accountCreatedAt(profile.userId)) ?? now;
    const reason = roomPostingBlock(
      {
        hasNickname: !!profile.nickname,
        suspended: isSuspended(profile, now),
        accountCreatedAt: createdAt,
        roomMutedUntil: profile.roomMutedUntil,
      },
      now,
    );
    const until =
      reason === 'muted'
        ? profile.roomMutedUntil
        : reason === 'suspended'
          ? profile.suspendedUntil
          : reason === 'new-account'
            ? new Date(createdAt.getTime() + DAY_MS)
            : null;
    return { allowed: reason === null, reason, until: until?.toISOString() ?? null };
  }

  private async views(rows: RoomMessageRow[], viewerId: string): Promise<RoomMessageView[]> {
    const badges = await this.mediaRepository.badges(rows.map((row) => row.userId));
    return rows.map((row) => ({
      id: row.id,
      nickname: row.user.cruisingProfile?.nickname ?? '',
      verified: badges.get(row.userId)?.verified ?? false,
      text: row.text,
      at: row.createdAt.toISOString(),
      mine: row.userId === viewerId,
    }));
  }

  /** A room's messages (the last 100, or those after `after`) and whether I may post. */
  async messages(
    userId: string,
    room: RoomKey,
    after: string | undefined,
    now = new Date(),
  ): Promise<{ items: RoomMessageView[]; posting: RoomPosting }> {
    const profile = await this.entered(userId);
    await this.room(room);
    const hidden = await this.repository.hiddenIds(userId);
    const rows = await this.rooms.messages(room, after ? new Date(after) : undefined, hidden, now);
    return { items: await this.views(rows, userId), posting: await this.posting(profile, now) };
  }

  /** Posts a message: refused with contact details or a link, past the rates, or when I can't. */
  async post(
    userId: string,
    room: RoomKey,
    text: string,
    now = new Date(),
  ): Promise<RoomMessageView> {
    const profile = await this.entered(userId);
    await this.room(room);
    const posting = await this.posting(profile, now);
    if (posting.reason) throw REFUSALS[posting.reason]();
    const refusal = roomTextRefusal(text);
    if (refusal === 'link') {
      throw new BadRequestException('Links are not allowed in city rooms');
    }
    if (refusal === 'contact') {
      throw new BadRequestException(
        'For everyone’s safety, phone numbers, emails, handles and other apps are never allowed in city rooms',
      );
    }
    const [lastMinute, lastDay] = await Promise.all([
      this.rooms.countPostedSince(userId, new Date(now.getTime() - MINUTE_MS)),
      this.rooms.countPostedSince(userId, new Date(now.getTime() - DAY_MS)),
    ]);
    if (!roomRateAllows(lastMinute, lastDay)) {
      throw new HttpException(
        'Too many messages: wait a little before posting again',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const row = await this.rooms.create({
      countryCode: room.countryCode,
      citySlug: room.citySlug,
      userId,
      text,
      createdAt: now,
    });
    const [view] = await this.views([row], userId);
    return view as RoomMessageView;
  }

  /**
   * My rooms: the cities of my favourites, of my trips that haven't ended and my country's busiest
   * (only cities with LIVE spots), with their latest message and last day's count.
   */
  async myRooms(userId: string, now = new Date()): Promise<{ items: RoomListItem[] }> {
    const profile = await this.entered(userId);
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const [favorites, trips, busiest] = await Promise.all([
      this.rooms.favoriteCities(userId),
      this.rooms.tripCities(userId, today),
      profile.country ? this.rooms.busiestCities(profile.country, now) : Promise.resolve([]),
    ]);
    const live = await this.rooms.liveCities(trips);
    const liveTrips = trips.filter((trip) => live.has(`${trip.countryCode}/${trip.citySlug}`));
    const candidates = mergeRooms(
      ...[favorites, liveTrips, busiest].map((group) =>
        group.map((room) => ({ ...room, lastAt: null, count24h: 0 })),
      ),
    );
    const stats = mergeRooms(await this.rooms.roomStats(candidates, now));
    return {
      items: stats.map((room) => ({
        countryCode: room.countryCode,
        citySlug: room.citySlug,
        city: room.city,
        lastAt: room.lastAt?.toISOString() ?? null,
        count24h: room.count24h,
      })),
    };
  }

  // ---- The team ----------------------------------------------------------------------------------

  /** Deletes a room message; its open reports are settled with it. */
  async deleteMessage(actor: AuthUser, id: string, now = new Date()): Promise<void> {
    const message = await this.rooms.findMessage(id);
    if (!message) throw new NotFoundException('Message not found');
    await this.rooms.closeOpenReportsOnRoomMessage(message.id, actor.id, now);
    await this.rooms.deleteMessage(message.id);
    await this.activity.record(actor, {
      action: 'cruising.room_message_deleted',
      targetId: message.id,
      targetLabel: `${message.countryCode}/${message.citySlug}`,
    });
  }

  /** Mutes a member from every room for a while or for good. */
  async mute(
    actor: AuthUser,
    userId: string,
    duration: SuspensionDuration,
    now = new Date(),
  ): Promise<void> {
    const profile = await this.repository.findProfile(userId);
    if (!profile) throw new NotFoundException('Member not found');
    await this.repository.updateProfile(userId, { roomMutedUntil: muteUntil(duration, now) });
    await this.activity.record(actor, {
      action: 'cruising.room_muted',
      targetId: userId,
      targetLabel: profile.nickname ?? userId,
      details: { duration },
    });
  }

  /** Lifts a member's mute. */
  async unmute(actor: AuthUser, userId: string, now = new Date()): Promise<void> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || !isMuted(profile.roomMutedUntil, now)) {
      throw new NotFoundException('Not muted');
    }
    await this.repository.updateProfile(userId, { roomMutedUntil: null });
    await this.activity.record(actor, {
      action: 'cruising.room_unmuted',
      targetId: userId,
      targetLabel: profile.nickname ?? userId,
    });
  }
}
