import { Injectable } from '@nestjs/common';
import type { CruisingRoomMessage, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ROOM_BUSIEST, ROOM_PAGE, type RoomListEntry } from './cruising-rooms.rules.js';

/** A room: the city of LIVE spots it belongs to. */
export interface RoomKey {
  countryCode: string;
  citySlug: string;
}

const authorSelect = {
  cruisingProfile: {
    select: { nickname: true, verificationStatus: true },
  },
} as const;

export type RoomMessageRow = Prisma.CruisingRoomMessageGetPayload<{
  include: { user: { select: typeof authorSelect } };
}>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Cruising's city chat rooms (architecture 4.15, phase 6, decision 100). */
@Injectable()
export class CruisingRoomsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** The city's name when it has LIVE spots (only those cities have a room), else null. */
  async roomCity(room: RoomKey): Promise<string | null> {
    const spot = await this.prisma.cruisingSpot.findFirst({
      where: { countryCode: room.countryCode, citySlug: room.citySlug, status: 'LIVE' },
      orderBy: { createdAt: 'asc' },
      select: { city: true },
    });
    return spot?.city ?? null;
  }

  /** When the account was created (posting needs it to be over 24 hours old). */
  async accountCreatedAt(userId: string): Promise<Date | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });
    return user?.createdAt ?? null;
  }

  /**
   * A room's visible messages, oldest first: the last 100, or those after `after`. Hidden ones,
   * those of people blocked either way and of suspended members are left out.
   */
  async messages(
    room: RoomKey,
    after: Date | undefined,
    hiddenIds: string[],
    now: Date,
  ): Promise<RoomMessageRow[]> {
    const where: Prisma.CruisingRoomMessageWhereInput = {
      countryCode: room.countryCode,
      citySlug: room.citySlug,
      hidden: false,
      ...(after ? { createdAt: { gt: after } } : {}),
      ...(hiddenIds.length ? { userId: { notIn: hiddenIds } } : {}),
      user: {
        cruisingProfile: {
          is: { OR: [{ suspendedAt: null }, { suspendedUntil: { lte: now } }] },
        },
      },
    };
    const include = { user: { select: authorSelect } };
    if (after) {
      return this.prisma.cruisingRoomMessage.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: ROOM_PAGE,
        include,
      });
    }
    const last = await this.prisma.cruisingRoomMessage.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: ROOM_PAGE,
      include,
    });
    return last.reverse();
  }

  /** Messages a member posted since `since` (any room, hidden ones too). */
  countPostedSince(userId: string, since: Date): Promise<number> {
    return this.prisma.cruisingRoomMessage.count({ where: { userId, createdAt: { gte: since } } });
  }

  create(data: Prisma.CruisingRoomMessageUncheckedCreateInput): Promise<RoomMessageRow> {
    return this.prisma.cruisingRoomMessage.create({
      data,
      include: { user: { select: authorSelect } },
    });
  }

  findMessage(id: string): Promise<CruisingRoomMessage | null> {
    return this.prisma.cruisingRoomMessage.findUnique({ where: { id } });
  }

  async setHidden(id: string, hidden: boolean): Promise<void> {
    await this.prisma.cruisingRoomMessage.updateMany({ where: { id }, data: { hidden } });
  }

  /** Deletes a message; false when there was none. */
  async deleteMessage(id: string): Promise<boolean> {
    const { count } = await this.prisma.cruisingRoomMessage.deleteMany({ where: { id } });
    return count > 0;
  }

  countOpenReportsOnRoomMessage(roomMessageId: string): Promise<number> {
    return this.prisma.cruisingReport.count({ where: { roomMessageId, status: 'OPEN' } });
  }

  /** The open reports of a deleted message are settled with it. */
  async closeOpenReportsOnRoomMessage(
    roomMessageId: string,
    reviewedById: string,
    now: Date,
  ): Promise<void> {
    await this.prisma.cruisingReport.updateMany({
      where: { roomMessageId, status: 'OPEN' },
      data: { status: 'ACTIONED', reviewedById, reviewedAt: now },
    });
  }

  // ---- My rooms ----------------------------------------------------------------------------------

  /** The cities of my favourite LIVE spots. */
  async favoriteCities(userId: string): Promise<(RoomKey & { city: string })[]> {
    const rows = await this.prisma.cruisingFavorite.findMany({
      where: { userId, spot: { status: 'LIVE' } },
      select: { spot: { select: { countryCode: true, citySlug: true, city: true } } },
      take: 200,
    });
    return rows.map((row) => row.spot);
  }

  /** The cities of my trips that haven't ended. */
  async tripCities(userId: string, today: Date): Promise<(RoomKey & { city: string })[]> {
    return this.prisma.cruisingTrip.findMany({
      where: { userId, endsOn: { gte: today } },
      select: { countryCode: true, citySlug: true, city: true },
      take: 50,
    });
  }

  /** Of these cities, those with LIVE spots (`CC/slug` keys). */
  async liveCities(rooms: RoomKey[]): Promise<Set<string>> {
    if (rooms.length === 0) return new Set();
    const rows = await this.prisma.cruisingSpot.groupBy({
      by: ['countryCode', 'citySlug'],
      where: {
        status: 'LIVE',
        OR: rooms.map((room) => ({ countryCode: room.countryCode, citySlug: room.citySlug })),
      },
    });
    return new Set(rows.map((row) => `${row.countryCode}/${row.citySlug}`));
  }

  /**
   * My country's busiest rooms: by visible messages in the last day, then (to fill the list) the
   * cities with the most LIVE spots.
   */
  async busiestCities(countryCode: string, now: Date): Promise<(RoomKey & { city: string })[]> {
    const [active, big] = await Promise.all([
      this.prisma.cruisingRoomMessage.groupBy({
        by: ['countryCode', 'citySlug'],
        where: { countryCode, hidden: false, createdAt: { gte: new Date(now.getTime() - DAY_MS) } },
        _count: { _all: true },
        orderBy: { _count: { id: 'desc' } },
        take: ROOM_BUSIEST,
      }),
      this.prisma.cruisingSpot.groupBy({
        by: ['countryCode', 'citySlug', 'city'],
        where: { countryCode, status: 'LIVE' },
        _count: { _all: true },
        orderBy: { _count: { id: 'desc' } },
        take: ROOM_BUSIEST,
      }),
    ]);
    const names = await this.cityNames(active);
    const live = await this.liveCities(active);
    return [
      ...active
        .filter((row) => live.has(`${row.countryCode}/${row.citySlug}`))
        .map((row) => ({
          countryCode: row.countryCode,
          citySlug: row.citySlug,
          city: names.get(`${row.countryCode}/${row.citySlug}`) ?? row.citySlug,
        })),
      ...big.map((row) => ({
        countryCode: row.countryCode,
        citySlug: row.citySlug,
        city: row.city,
      })),
    ].slice(0, ROOM_BUSIEST);
  }

  private async cityNames(rooms: RoomKey[]): Promise<Map<string, string>> {
    if (rooms.length === 0) return new Map();
    const rows = await this.prisma.cruisingSpot.findMany({
      where: {
        status: 'LIVE',
        OR: rooms.map((room) => ({ countryCode: room.countryCode, citySlug: room.citySlug })),
      },
      distinct: ['countryCode', 'citySlug'],
      select: { countryCode: true, citySlug: true, city: true },
    });
    return new Map(rows.map((row) => [`${row.countryCode}/${row.citySlug}`, row.city]));
  }

  /** Each room's latest visible message and how many it had in the last day. */
  async roomStats(rooms: (RoomKey & { city: string })[], now: Date): Promise<RoomListEntry[]> {
    if (rooms.length === 0) return [];
    const scope = rooms.map((room) => ({
      countryCode: room.countryCode,
      citySlug: room.citySlug,
    }));
    const [latest, recent] = await Promise.all([
      this.prisma.cruisingRoomMessage.groupBy({
        by: ['countryCode', 'citySlug'],
        where: { hidden: false, OR: scope },
        _max: { createdAt: true },
      }),
      this.prisma.cruisingRoomMessage.groupBy({
        by: ['countryCode', 'citySlug'],
        where: { hidden: false, createdAt: { gte: new Date(now.getTime() - DAY_MS) }, OR: scope },
        _count: { _all: true },
      }),
    ]);
    const key = (room: RoomKey) => `${room.countryCode}/${room.citySlug}`;
    const last = new Map(latest.map((row) => [key(row), row._max.createdAt]));
    const counts = new Map(recent.map((row) => [key(row), row._count._all]));
    return rooms.map((room) => ({
      countryCode: room.countryCode,
      citySlug: room.citySlug,
      city: room.city,
      lastAt: last.get(key(room)) ?? null,
      count24h: counts.get(key(room)) ?? 0,
    }));
  }
}
