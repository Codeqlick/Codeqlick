import { Injectable } from '@nestjs/common';
import type {
  CruisingMeetupStatus,
  CruisingSafetyKind,
  CruisingSafetyVoteKind,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Bbox } from './cruising.rules.js';

/** What names a member in a list: the nickname, the badge and whether they are suspended. */
const memberSelect = {
  nickname: true,
  verificationStatus: true,
  suspendedAt: true,
  suspendedUntil: true,
} as const;

/** The most attendees a meetup lists (a meetup with no limit is rarely this big). */
const MAX_ATTENDEES = 200;

const meetupInclude = {
  spot: {
    select: {
      id: true,
      slug: true,
      name: true,
      city: true,
      citySlug: true,
      countryCode: true,
      status: true,
    },
  },
  host: { select: { cruisingProfile: { select: memberSelect } } },
  attendees: {
    orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }],
    take: MAX_ATTENDEES,
    select: {
      userId: true,
      anonymous: true,
      createdAt: true,
      user: { select: { cruisingProfile: { select: memberSelect } } },
    },
  },
} satisfies Prisma.CruisingMeetupInclude;

export type MeetupRow = Prisma.CruisingMeetupGetPayload<{ include: typeof meetupInclude }>;

/** Members not suspended right now. */
function notSuspended(now: Date): Prisma.CruisingProfileWhereInput {
  return { OR: [{ suspendedAt: null }, { suspendedUntil: { lte: now } }] };
}

/** Where a list of meetups looks: some spots, a city, or some countries (any of them). */
export interface MeetupScope {
  spotIds?: string[];
  countryCode?: string;
  citySlug?: string;
  countries?: string[];
  /** Also the meetups this member hosts or said they are going to. */
  memberId?: string;
}

/** Someone to tell about something, with how they can be reached. */
const recipientSelect = {
  id: true,
  email: true,
  locale: true,
  cruisingProfile: {
    select: { emailAlerts: true, suspendedAt: true, suspendedUntil: true, termsVersion: true },
  },
  _count: { select: { cruisingPushSubscriptions: true } },
} as const;

/**
 * Cruising's phase 5 (architecture 4.15): meetups (decision 88), trips (decision 90) and safety
 * alerts (decision 91). Only this repository touches their tables.
 */
@Injectable()
export class CruisingCommunityRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ---- Meetups -----------------------------------------------------------------------------------

  findMeetup(id: string): Promise<MeetupRow | null> {
    return this.prisma.cruisingMeetup.findUnique({ where: { id }, include: meetupInclude });
  }

  /**
   * LIVE meetups that haven't ended at LIVE spots in `scope` (any of its parts), soonest first,
   * without those hosted by people hidden from the viewer or by suspended members.
   */
  upcomingMeetups(
    scope: MeetupScope,
    now: Date,
    hiddenIds: string[],
    take: number,
  ): Promise<MeetupRow[]> {
    const places: Prisma.CruisingSpotWhereInput[] = [];
    if (scope.spotIds?.length) places.push({ id: { in: scope.spotIds } });
    if (scope.countryCode) {
      places.push({
        countryCode: scope.countryCode,
        ...(scope.citySlug ? { citySlug: scope.citySlug } : {}),
      });
    }
    if (scope.countries?.length) places.push({ countryCode: { in: scope.countries } });
    const any: Prisma.CruisingMeetupWhereInput[] = [];
    if (places.length > 0) any.push({ spot: { OR: places } });
    if (scope.memberId) {
      any.push({ hostId: scope.memberId }, { attendees: { some: { userId: scope.memberId } } });
    }
    if (any.length === 0) return Promise.resolve([]);
    return this.prisma.cruisingMeetup.findMany({
      where: {
        status: 'LIVE',
        endsAt: { gt: now },
        ...(hiddenIds.length ? { hostId: { notIn: hiddenIds } } : {}),
        host: { cruisingProfile: { is: notSuspended(now) } },
        spot: { status: 'LIVE' },
        OR: any,
      },
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
      take,
      include: meetupInclude,
    });
  }

  /** Meetups `hostId` planned since `since`, cancelled ones too (3 a week). */
  countMeetupsSince(hostId: string, since: Date): Promise<number> {
    return this.prisma.cruisingMeetup.count({ where: { hostId, createdAt: { gte: since } } });
  }

  createMeetup(data: Prisma.CruisingMeetupUncheckedCreateInput): Promise<MeetupRow> {
    return this.prisma.cruisingMeetup.create({ data, include: meetupInclude });
  }

  /**
   * Says "I'm going" (or changes the anonymous flag): `full` when the meetup has no room left.
   * The count and the write happen under a lock, so two people can't take the last place.
   */
  async attend(
    meetupId: string,
    userId: string,
    anonymous: boolean,
    capacity: number | null,
    now: Date,
  ): Promise<'ok' | 'full'> {
    return this.prisma.$transaction(async (tx) => {
      // The meetup's row is locked: joins of the same meetup wait for each other.
      await tx.$queryRaw`SELECT id FROM cruising_meetups WHERE id = ${meetupId}::uuid FOR UPDATE`;
      const already = await tx.cruisingMeetupAttendee.findUnique({
        where: { meetupId_userId: { meetupId, userId } },
        select: { userId: true },
      });
      if (!already && capacity !== null) {
        const going = await tx.cruisingMeetupAttendee.count({ where: { meetupId } });
        if (going >= capacity) return 'full' as const;
      }
      await tx.cruisingMeetupAttendee.upsert({
        where: { meetupId_userId: { meetupId, userId } },
        create: { meetupId, userId, anonymous, createdAt: now },
        update: { anonymous },
      });
      return 'ok' as const;
    });
  }

  async leave(meetupId: string, userId: string): Promise<void> {
    await this.prisma.cruisingMeetupAttendee.deleteMany({ where: { meetupId, userId } });
  }

  async setMeetupStatus(id: string, status: CruisingMeetupStatus): Promise<void> {
    await this.prisma.cruisingMeetup.update({ where: { id }, data: { status } });
  }

  /** The attendees of a meetup with how to reach them (their account's language, devices). */
  async attendeeRecipients(meetupId: string) {
    const rows = await this.prisma.cruisingMeetupAttendee.findMany({
      where: { meetupId },
      select: { user: { select: recipientSelect } },
    });
    return rows.map((row) => row.user);
  }

  /** Deletes the meetups that ended before `before`; how many. */
  async deleteMeetupsEndedBefore(before: Date): Promise<number> {
    const { count } = await this.prisma.cruisingMeetup.deleteMany({
      where: { endsAt: { lt: before } },
    });
    return count;
  }

  /** The spots a member saved (any status: the meetups' own filter keeps LIVE ones). */
  async favoriteSpotIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.cruisingFavorite.findMany({
      where: { userId },
      select: { spotId: true },
      take: 500,
    });
    return rows.map((row) => row.spotId);
  }

  // ---- Trips -------------------------------------------------------------------------------------

  /** The name of a city with LIVE spots (the spelling of its best-rated spot), or null. */
  async liveCity(countryCode: string, citySlug: string): Promise<string | null> {
    const spot = await this.prisma.cruisingSpot.findFirst({
      where: { status: 'LIVE', countryCode, citySlug },
      orderBy: [{ ratingCount: 'desc' }, { id: 'asc' }],
      select: { city: true },
    });
    return spot?.city ?? null;
  }

  countUpcomingTrips(userId: string, today: Date): Promise<number> {
    return this.prisma.cruisingTrip.count({ where: { userId, endsOn: { gte: today } } });
  }

  createTrip(data: Prisma.CruisingTripUncheckedCreateInput) {
    return this.prisma.cruisingTrip.create({ data });
  }

  /** My trips that haven't ended, soonest first. */
  myTrips(userId: string, today: Date) {
    return this.prisma.cruisingTrip.findMany({
      where: { userId, endsOn: { gte: today } },
      orderBy: [{ startsOn: 'asc' }, { id: 'asc' }],
      take: 20,
    });
  }

  /** The countries of my upcoming trips. */
  async tripCountries(userId: string, today: Date): Promise<string[]> {
    const rows = await this.prisma.cruisingTrip.findMany({
      where: { userId, endsOn: { gte: today } },
      select: { countryCode: true },
      distinct: ['countryCode'],
    });
    return rows.map((row) => row.countryCode);
  }

  /** Deletes my trip; false when it isn't mine. */
  async deleteTrip(id: string, userId: string): Promise<boolean> {
    const { count } = await this.prisma.cruisingTrip.deleteMany({ where: { id, userId } });
    return count > 0;
  }

  /**
   * The listed trips to a city overlapping `[from, until]`, soonest first: by members with a
   * nickname, entered with `termsVersion`, not suspended, not in `excludeIds`.
   */
  visitors(
    countryCode: string,
    citySlug: string,
    from: Date,
    until: Date,
    excludeIds: string[],
    termsVersion: string,
    now: Date,
    take: number,
  ) {
    return this.prisma.cruisingTrip.findMany({
      where: {
        countryCode,
        citySlug,
        listed: true,
        endsOn: { gte: from },
        startsOn: { lte: until },
        ...(excludeIds.length ? { userId: { notIn: excludeIds } } : {}),
        user: {
          cruisingProfile: {
            is: { nickname: { not: null }, termsVersion, ...notSuspended(now) },
          },
        },
      },
      orderBy: [{ startsOn: 'asc' }, { id: 'asc' }],
      take,
      select: {
        userId: true,
        startsOn: true,
        endsOn: true,
        user: { select: { cruisingProfile: { select: memberSelect } } },
      },
    });
  }

  /** Deletes the trips whose last day is before `day`; how many. */
  async deleteTripsEndedBefore(day: Date): Promise<number> {
    const { count } = await this.prisma.cruisingTrip.deleteMany({
      where: { endsOn: { lt: day } },
    });
    return count;
  }

  // ---- Safety alerts -----------------------------------------------------------------------------

  countSafetyAlertsSince(posterId: string, since: Date): Promise<number> {
    return this.prisma.cruisingSafetyAlert.count({
      where: { posterId, createdAt: { gte: since } },
    });
  }

  createSafetyAlert(data: {
    spotId: string;
    posterId: string;
    kind: CruisingSafetyKind;
    note: string | null;
    expiresAt: Date;
    createdAt: Date;
  }) {
    return this.prisma.cruisingSafetyAlert.create({ data });
  }

  findSafetyAlert(id: string) {
    return this.prisma.cruisingSafetyAlert.findUnique({
      where: { id },
      include: { spot: { select: { id: true, status: true } } },
    });
  }

  /** A spot's active alerts, newest first, with their confirmations and the viewer's vote. */
  activeSafetyAlerts(spotId: string, viewerId: string, now: Date) {
    return this.prisma.cruisingSafetyAlert.findMany({
      where: { spotId, hidden: false, expiresAt: { gt: now } },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      take: 50,
      select: {
        id: true,
        kind: true,
        note: true,
        posterId: true,
        createdAt: true,
        expiresAt: true,
        _count: { select: { votes: { where: { kind: 'CONFIRM' } } } },
        votes: { where: { userId: viewerId }, select: { kind: true } },
      },
    });
  }

  /** Records a member's vote; false when they had voted on this alert already. */
  async vote(
    alertId: string,
    userId: string,
    kind: CruisingSafetyVoteKind,
    now: Date,
  ): Promise<boolean> {
    const { count } = await this.prisma.cruisingSafetyVote.createMany({
      data: [{ alertId, userId, kind, createdAt: now }],
      skipDuplicates: true,
    });
    return count > 0;
  }

  countVotes(alertId: string, kind: CruisingSafetyVoteKind): Promise<number> {
    return this.prisma.cruisingSafetyVote.count({ where: { alertId, kind } });
  }

  async setSafetyExpiry(id: string, expiresAt: Date): Promise<void> {
    await this.prisma.cruisingSafetyAlert.update({ where: { id }, data: { expiresAt } });
  }

  /** LIVE spots in the box with active alerts, and how many each. */
  async safetyInBox(box: Bbox, now: Date, take: number) {
    const rows = await this.prisma.cruisingSafetyAlert.groupBy({
      by: ['spotId'],
      where: {
        hidden: false,
        expiresAt: { gt: now },
        spot: {
          status: 'LIVE',
          lng: { gte: box.minLng, lte: box.maxLng },
          lat: { gte: box.minLat, lte: box.maxLat },
        },
      },
      _count: { _all: true },
      orderBy: { spotId: 'asc' },
      take,
    });
    return rows.map((row) => ({ spotId: row.spotId, alerts: row._count._all }));
  }

  /** Deletes the alerts that expired before `before`; how many. */
  async deleteSafetyAlertsExpiredBefore(before: Date): Promise<number> {
    const { count } = await this.prisma.cruisingSafetyAlert.deleteMany({
      where: { expiresAt: { lt: before } },
    });
    return count;
  }
}
