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
import {
  CruisingCommunityRepository,
  type MeetupRow,
  type MeetupScope,
} from './cruising-community.repository.js';
import {
  addDays,
  confirmedExpiry,
  formatDay,
  goneEnds,
  MAX_UPCOMING_TRIPS,
  MEETUP_KEEP_MS,
  MEETUPS_PER_WEEK,
  meetupEnd,
  meetupIsOver,
  meetupTimeProblem,
  parseDay,
  SAFETY_ALERTS_PER_DAY,
  SAFETY_KEEP_MS,
  safetyActive,
  safetyExpiry,
  tripDatesProblem,
  tripsOverBefore,
  utcDay,
  VISITORS_WINDOW_DAYS,
  WEEK_MS,
  type SafetyKind,
} from './cruising-community.rules.js';
import {
  MAX_MEETUPS_LISTED,
  MAX_VISITORS_LISTED,
  type MeetupInput,
  type MeetupsQuery,
  type SafetyAlertInput,
  type TripInput,
} from './cruising-community.schemas.js';
import { cruisingNoticeEmail } from './cruising-emails.js';
import { CruisingPushService } from './cruising-push.service.js';
import { isSuspended, type Bbox } from './cruising.rules.js';
import { CruisingRepository } from './cruising.repository.js';
import { MAX_ACTIVE_IN_BOX, MAX_SPOTS_IN_CITY } from './cruising.schemas.js';
import { spotSummary, type CruisingSpotSummary } from './cruising.service.js';
import { CruisingSocialService } from './cruising-social.service.js';
import { ROOM_KEEP_MS } from './cruising-rooms.rules.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Meetups, trips and alerts that are over are deleted by a check this often. */
const CLEANUP_EVERY_MS = 60 * 60 * 1000;
/** The spots a trip card shows. */
const TRIP_SPOTS = 5;
/** The meetups a trip card shows. */
const TRIP_MEETUPS = 10;

/** A member as lists name them. */
type ProfileBits = {
  nickname: string | null;
  verificationStatus: string;
  suspendedAt: Date | null;
  suspendedUntil: Date | null;
} | null;

export interface CruisingMeetupView {
  id: string;
  spot: {
    id: string;
    slug: string;
    name: string;
    city: string;
    citySlug: string;
    countryCode: string;
  };
  startsAt: string;
  endsAt: string;
  title: string;
  description: string;
  /** Null: no limit. */
  capacity: number | null;
  /** Who said "I'm going" (anonymous ones too), without the people hidden from me. */
  going: number;
  /** No room left. */
  full: boolean;
  /** I am the host. */
  mine: boolean;
  /** My own "I'm going", or null. */
  attending: { anonymous: boolean } | null;
  host: { nickname: string; verified: boolean };
  /** The ones going who aren't anonymous. */
  attendees: { nickname: string; verified: boolean }[];
}

export interface CruisingTripView {
  id: string;
  countryCode: string;
  citySlug: string;
  city: string;
  from: string;
  to: string;
  listed: boolean;
  /** The city's spots with the most people now, then the best rated. */
  spots: (CruisingSpotSummary & { here: number })[];
  /** The city's meetups during the trip. */
  meetups: CruisingMeetupView[];
}

export interface CruisingVisitorView {
  nickname: string;
  verified: boolean;
  from: string;
  to: string;
}

export interface CruisingSafetyAlertView {
  id: string;
  kind: SafetyKind;
  note: string | null;
  createdAt: string;
  expiresAt: string;
  confirmations: number;
  /** I posted it (only ever said to the poster: the poster is never shown to others). */
  mine: boolean;
  /** What I said about it, if anything. */
  myVote: 'CONFIRM' | 'GONE' | null;
}

/** Whether a profile is someone a list may name now. */
function named(
  profile: ProfileBits,
  now: Date,
): profile is NonNullable<ProfileBits> & {
  nickname: string;
} {
  return !!profile?.nickname && !isSuspended(profile, now);
}

/**
 * Cruising's phase 5 (architecture 4.15): meetups at spots (decision 88), trips and "Visiting
 * soon" (decision 90) and safety alerts (decision 91). Everything here is for entered members;
 * texts go through the contact filter; nothing sent outside the app names a spot or a person.
 */
@Injectable()
export class CruisingCommunityService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CruisingCommunityService.name);
  private timers: NodeJS.Timeout[] = [];
  /** Alerts and notices still being sent after their request answered. */
  private readonly pending = new Set<Promise<unknown>>();

  constructor(
    private readonly community: CruisingCommunityRepository,
    private readonly repository: CruisingRepository,
    private readonly social: CruisingSocialService,
    private readonly push: CruisingPushService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timers.push(setInterval(() => void this.cleanup(), CLEANUP_EVERY_MS).unref());
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

  /** Waits for the alerts and notices still being sent (for tests). */
  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all(this.pending);
  }

  /**
   * Deletes meetups 7 days after they end, trips the day after their last day, safety alerts a
   * day after they expire and city room messages after 7 days.
   */
  async cleanup(now = new Date()): Promise<void> {
    try {
      await this.community.deleteMeetupsEndedBefore(new Date(now.getTime() - MEETUP_KEEP_MS));
      await this.community.deleteTripsEndedBefore(tripsOverBefore(now));
      await this.community.deleteSafetyAlertsExpiredBefore(
        new Date(now.getTime() - SAFETY_KEEP_MS),
      );
      // Phase 6 (decision 100): city room messages go after 7 days.
      await this.community.deleteRoomMessagesBefore(new Date(now.getTime() - ROOM_KEEP_MS));
    } catch (error) {
      this.logger.error(`Cruising phase 5 cleanup failed: ${String(error)}`);
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

  /** A member who may write now. */
  private async allowed(userId: string, now: Date): Promise<CruisingProfile> {
    const profile = await this.entered(userId);
    if (isSuspended(profile, now)) throw new ForbiddenException('Your account is suspended');
    return profile;
  }

  private needNickname(profile: CruisingProfile): void {
    if (!profile.nickname) throw new ConflictException('Choose a nickname first');
  }

  private async liveSpot(spotId: string) {
    const spot = await this.repository.findSpot(spotId);
    if (!spot || spot.status !== 'LIVE') throw new NotFoundException('Spot not found');
    return spot;
  }

  /** A text that shares a phone number, an email, a link or an outside app is refused. */
  private checkText(...texts: (string | null | undefined)[]): void {
    if (texts.some((text) => text && sharesContact(text))) {
      throw new BadRequestException(
        'For your safety, phone numbers, emails, links and other apps cannot be shared here',
      );
    }
  }

  // ---- Meetups (decision 88) ---------------------------------------------------------------------

  private meetupView(
    row: MeetupRow,
    viewerId: string,
    hidden: ReadonlySet<string>,
    now: Date,
  ): CruisingMeetupView {
    const visible = row.attendees.filter(
      (attendee) =>
        attendee.userId === viewerId ||
        (!hidden.has(attendee.userId) && !isSuspended(attendee.user.cruisingProfile, now)),
    );
    const mine = row.attendees.find((attendee) => attendee.userId === viewerId);
    const host = row.host.cruisingProfile;
    return {
      id: row.id,
      spot: {
        id: row.spot.id,
        slug: row.spot.slug,
        name: row.spot.name,
        city: row.spot.city,
        citySlug: row.spot.citySlug,
        countryCode: row.spot.countryCode,
      },
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      title: row.title,
      description: row.description,
      capacity: row.capacity,
      going: visible.length,
      full: row.capacity !== null && row.attendees.length >= row.capacity,
      mine: row.hostId === viewerId,
      attending: mine ? { anonymous: mine.anonymous } : null,
      host: {
        nickname: host?.nickname ?? '—',
        verified: host?.verificationStatus === 'APPROVED',
      },
      attendees: visible.flatMap((attendee) => {
        const profile = attendee.user.cruisingProfile;
        return !attendee.anonymous && named(profile, now)
          ? [{ nickname: profile.nickname, verified: profile.verificationStatus === 'APPROVED' }]
          : [];
      }),
    };
  }

  /**
   * Upcoming meetups: at a spot, in a city or a country, or, with no filter, at my favourite spots,
   * in my country and my trips' countries, and the ones I host or go to.
   */
  async meetups(
    userId: string,
    query: MeetupsQuery,
    now = new Date(),
  ): Promise<{ items: CruisingMeetupView[] }> {
    const me = await this.entered(userId);
    let scope: MeetupScope;
    if (query.spotId) scope = { spotIds: [query.spotId] };
    else if (query.countryCode) {
      scope = { countryCode: query.countryCode, citySlug: query.citySlug };
    } else {
      const [favorites, tripCountries] = await Promise.all([
        this.community.favoriteSpotIds(userId),
        this.community.tripCountries(userId, utcDay(now)),
      ]);
      scope = {
        spotIds: favorites,
        countries: [...new Set([...(me.country ? [me.country] : []), ...tripCountries])],
        memberId: userId,
      };
    }
    const hidden = await this.repository.hiddenIds(userId);
    const rows = await this.community.upcomingMeetups(scope, now, hidden, MAX_MEETUPS_LISTED);
    const hiddenSet = new Set(hidden);
    return { items: rows.map((row) => this.meetupView(row, userId, hiddenSet, now)) };
  }

  /** Plans a meetup at a LIVE spot (3 a week); the members who saved the spot are told. */
  async createMeetup(
    userId: string,
    input: MeetupInput,
    now = new Date(),
  ): Promise<CruisingMeetupView> {
    const me = await this.allowed(userId, now);
    this.needNickname(me);
    const spot = await this.liveSpot(input.spotId);
    const startsAt = new Date(input.startsAt);
    const problem = meetupTimeProblem(startsAt, input.hours, now);
    if (problem === 'too-soon') {
      throw new BadRequestException('A meetup starts at least 30 minutes from now');
    }
    if (problem === 'too-far') {
      throw new BadRequestException('A meetup starts at most 30 days from now');
    }
    if (problem) throw new BadRequestException('A meetup lasts 1 to 4 hours');
    this.checkText(input.title, input.description);
    const week = await this.community.countMeetupsSince(userId, new Date(now.getTime() - WEEK_MS));
    if (week >= MEETUPS_PER_WEEK) {
      throw new HttpException(
        `You can plan ${MEETUPS_PER_WEEK} meetups a week`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const row = await this.community.createMeetup({
      spotId: spot.id,
      hostId: userId,
      title: input.title,
      description: input.description,
      startsAt,
      endsAt: meetupEnd(startsAt, input.hours),
      capacity: input.capacity ?? null,
      createdAt: now,
    });
    this.later(() => this.social.alertFavorites(spot.id, userId, now, 'meetup'), 'meetup alerts');
    return this.meetupView(row, userId, new Set(), now);
  }

  /** A meetup I can see: LIVE, at a LIVE spot, its host not hidden from me nor suspended. */
  private async visibleMeetup(userId: string, meetupId: string, now: Date): Promise<MeetupRow> {
    const row = await this.community.findMeetup(meetupId);
    if (
      !row ||
      row.status !== 'LIVE' ||
      row.spot.status !== 'LIVE' ||
      isSuspended(row.host.cruisingProfile, now) ||
      (row.hostId !== userId && (await this.repository.hiddenIds(userId)).includes(row.hostId))
    ) {
      throw new NotFoundException('Meetup not found');
    }
    return row;
  }

  /** "I'm going" (or switches the anonymous flag): `409` when it is full or over. */
  async attend(
    userId: string,
    meetupId: string,
    anonymous: boolean,
    now = new Date(),
  ): Promise<void> {
    const me = await this.allowed(userId, now);
    this.needNickname(me);
    const row = await this.visibleMeetup(userId, meetupId, now);
    if (row.hostId === userId) throw new ConflictException('You are hosting this meetup');
    if (meetupIsOver(row.endsAt, now)) throw new ConflictException('This meetup is over');
    const result = await this.community.attend(row.id, userId, anonymous, row.capacity, now);
    if (result === 'full') throw new ConflictException('This meetup is full');
  }

  /** I'm not going after all (not going is fine). */
  async leave(userId: string, meetupId: string): Promise<void> {
    await this.entered(userId);
    const row = await this.community.findMeetup(meetupId);
    if (!row) throw new NotFoundException('Meetup not found');
    await this.community.leave(row.id, userId);
  }

  /** The host cancels: the attendees are told it was cancelled, never which one. */
  async cancelMeetup(userId: string, meetupId: string, now = new Date()): Promise<void> {
    await this.entered(userId);
    const row = await this.community.findMeetup(meetupId);
    if (!row || row.hostId !== userId || row.status === 'CANCELLED') {
      throw new NotFoundException('Meetup not found');
    }
    if (meetupIsOver(row.endsAt, now)) throw new ConflictException('This meetup is over');
    await this.community.setMeetupStatus(row.id, 'CANCELLED');
    this.later(() => this.notifyCancelled(row.id, now), 'meetup cancellation');
  }

  /**
   * Tells each attendee that a meetup they joined was cancelled: on their devices, or by email when
   * they have none (unless they turned Cruising's emails off). Suspended members aren't told.
   */
  async notifyCancelled(meetupId: string, now = new Date()): Promise<number> {
    const recipients = await this.community.attendeeRecipients(meetupId);
    const pushTo: { userId: string; locale: 'en' | 'es' }[] = [];
    let told = 0;
    for (const user of recipients) {
      const profile = user.cruisingProfile;
      if (!profile || isSuspended(profile, now)) continue;
      const locale = toApiLocale(user.locale);
      if (this.push.enabled && user._count.cruisingPushSubscriptions > 0) {
        pushTo.push({ userId: user.id, locale });
        told += 1;
      } else if (profile.emailAlerts) {
        told += 1;
        this.mail
          .send(
            cruisingNoticeEmail(
              user.email,
              locale,
              'meetup-cancelled',
              null,
              this.config.webappUrl('cruising'),
              this.config.siteUrl,
            ),
          )
          .catch((error: unknown) => {
            this.logger.error(`Cruising email not sent: ${String(error)}`);
          });
      }
    }
    await this.push.notify('meetup-cancelled', pushTo);
    return told;
  }

  // ---- Trips (decision 90) -----------------------------------------------------------------------

  /** My trips that haven't ended, each with the city's busiest spots and its meetups then. */
  async trips(userId: string, now = new Date()): Promise<{ items: CruisingTripView[] }> {
    await this.entered(userId);
    const rows = await this.community.myTrips(userId, utcDay(now));
    const hidden = await this.repository.hiddenIds(userId);
    const hiddenSet = new Set(hidden);
    const items = await Promise.all(
      rows.map(async (trip): Promise<CruisingTripView> => {
        const spots = await this.repository.citySpots(
          trip.countryCode,
          trip.citySlug,
          MAX_SPOTS_IN_CITY,
        );
        const here = await this.repository.hereAt(
          spots.map((spot) => spot.id),
          now,
          hidden,
        );
        const busiest = spots
          .map((spot) => ({ ...spotSummary(spot), here: here.get(spot.id) ?? 0 }))
          .toSorted((a, b) => b.here - a.here)
          .slice(0, TRIP_SPOTS);
        const meetups = await this.community.upcomingMeetups(
          { countryCode: trip.countryCode, citySlug: trip.citySlug },
          now,
          hidden,
          MAX_MEETUPS_LISTED,
        );
        const tripEnd = addDays(trip.endsOn, 1).getTime();
        return {
          id: trip.id,
          countryCode: trip.countryCode,
          citySlug: trip.citySlug,
          city: trip.city,
          from: formatDay(trip.startsOn),
          to: formatDay(trip.endsOn),
          listed: trip.listed,
          spots: busiest,
          meetups: meetups
            .filter(
              (meetup) =>
                meetup.startsAt.getTime() < tripEnd &&
                meetup.endsAt.getTime() > trip.startsOn.getTime(),
            )
            .slice(0, TRIP_MEETUPS)
            .map((meetup) => this.meetupView(meetup, userId, hiddenSet, now)),
        };
      }),
    );
    return { items };
  }

  /** Announces a trip to a city with LIVE spots (up to 3 upcoming). */
  async createTrip(
    userId: string,
    input: TripInput,
    now = new Date(),
  ): Promise<Omit<CruisingTripView, 'spots' | 'meetups'>> {
    const me = await this.allowed(userId, now);
    this.needNickname(me);
    const city = await this.community.liveCity(input.countryCode, input.citySlug);
    if (!city) throw new NotFoundException('No spots in this city');
    const from = parseDay(input.from);
    const to = parseDay(input.to);
    const problem = tripDatesProblem(from, to, now);
    if (problem === 'past') throw new BadRequestException('A trip starts today or later');
    if (problem === 'too-far') {
      throw new BadRequestException('A trip starts at most 60 days from today');
    }
    if (problem === 'order') throw new BadRequestException('A trip ends on or after its start');
    if (problem) throw new BadRequestException('A trip lasts at most 14 days');
    if ((await this.community.countUpcomingTrips(userId, utcDay(now))) >= MAX_UPCOMING_TRIPS) {
      throw new ConflictException(`You can have ${MAX_UPCOMING_TRIPS} upcoming trips`);
    }
    const trip = await this.community.createTrip({
      userId,
      countryCode: input.countryCode,
      citySlug: input.citySlug,
      city,
      startsOn: from,
      endsOn: to,
      listed: input.listed,
      createdAt: now,
    });
    return {
      id: trip.id,
      countryCode: trip.countryCode,
      citySlug: trip.citySlug,
      city: trip.city,
      from: formatDay(trip.startsOn),
      to: formatDay(trip.endsOn),
      listed: trip.listed,
    };
  }

  async deleteTrip(userId: string, tripId: string): Promise<void> {
    await this.entered(userId);
    if (!(await this.community.deleteTrip(tripId, userId))) {
      throw new NotFoundException('Trip not found');
    }
  }

  /**
   * "Visiting soon": the listed trips to a city overlapping the next 60 days, by members with a
   * nickname, never the blocked either way, never the suspended, never mine.
   */
  async visitors(
    userId: string,
    countryCode: string,
    citySlug: string,
    now = new Date(),
  ): Promise<{ items: CruisingVisitorView[] }> {
    await this.entered(userId);
    const today = utcDay(now);
    const hidden = await this.repository.hiddenIds(userId);
    const rows = await this.community.visitors(
      countryCode,
      citySlug,
      today,
      addDays(today, VISITORS_WINDOW_DAYS),
      [userId, ...hidden],
      this.config.cruisingTermsVersion,
      now,
      MAX_VISITORS_LISTED,
    );
    return {
      items: rows.flatMap((row) => {
        const profile = row.user.cruisingProfile;
        return named(profile, now)
          ? [
              {
                nickname: profile.nickname,
                verified: profile.verificationStatus === 'APPROVED',
                from: formatDay(row.startsOn),
                to: formatDay(row.endsOn),
              },
            ]
          : [];
      }),
    };
  }

  // ---- Safety alerts (decision 91) ---------------------------------------------------------------

  /** A spot's active alerts, newest first. Who posted one is never said (only "mine" to them). */
  async safetyAlerts(
    userId: string,
    spotId: string,
    now = new Date(),
  ): Promise<{ items: CruisingSafetyAlertView[] }> {
    await this.entered(userId);
    const spot = await this.liveSpot(spotId);
    const rows = await this.community.activeSafetyAlerts(spot.id, userId, now);
    return {
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        confirmations: row._count.votes,
        mine: row.posterId === userId,
        myVote: row.votes[0]?.kind ?? null,
      })),
    };
  }

  /** Posts an alert at a LIVE spot (5 a day); the members who saved the spot are told. */
  async createSafetyAlert(
    userId: string,
    spotId: string,
    input: SafetyAlertInput,
    now = new Date(),
  ): Promise<CruisingSafetyAlertView> {
    await this.allowed(userId, now);
    const spot = await this.liveSpot(spotId);
    this.checkText(input.note);
    const today = await this.community.countSafetyAlertsSince(
      userId,
      new Date(now.getTime() - DAY_MS),
    );
    if (today >= SAFETY_ALERTS_PER_DAY) {
      throw new HttpException(
        `You can post ${SAFETY_ALERTS_PER_DAY} safety alerts a day`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const alert = await this.community.createSafetyAlert({
      spotId: spot.id,
      posterId: userId,
      kind: input.kind,
      note: input.note,
      expiresAt: safetyExpiry(input.kind, now),
      createdAt: now,
    });
    this.later(() => this.social.alertFavorites(spot.id, userId, now, 'safety'), 'safety alerts');
    return {
      id: alert.id,
      kind: alert.kind,
      note: alert.note,
      createdAt: alert.createdAt.toISOString(),
      expiresAt: alert.expiresAt.toISOString(),
      confirmations: 0,
      mine: true,
      myVote: null,
    };
  }

  /**
   * A member says an alert is still true (it lasts 3 hours more, up to 24 hours from the first) or
   * gone (three of those end it). Once per member and alert; never on one's own.
   */
  async voteSafetyAlert(
    userId: string,
    alertId: string,
    kind: 'CONFIRM' | 'GONE',
    now = new Date(),
  ): Promise<void> {
    await this.allowed(userId, now);
    const alert = await this.community.findSafetyAlert(alertId);
    if (!alert || alert.spot.status !== 'LIVE' || !safetyActive(alert, now)) {
      throw new NotFoundException('Alert not found');
    }
    if (alert.posterId === userId) throw new ConflictException('You posted this alert');
    if (!(await this.community.vote(alert.id, userId, kind, now))) {
      throw new ConflictException('You already said something about this alert');
    }
    if (kind === 'CONFIRM') {
      const expiresAt = confirmedExpiry(alert.createdAt, alert.expiresAt);
      if (expiresAt.getTime() !== alert.expiresAt.getTime()) {
        await this.community.setSafetyExpiry(alert.id, expiresAt);
      }
    } else if (goneEnds(await this.community.countVotes(alert.id, 'GONE'))) {
      await this.community.setSafetyExpiry(alert.id, now);
    }
  }

  /**
   * The LIVE spots of a box of the map with active alerts (the map's warning markers), on the same
   * grid as active now; only for entered members.
   */
  async safetyInBox(
    userId: string,
    box: Bbox,
    now = new Date(),
  ): Promise<{ items: { spotId: string; alerts: number }[] }> {
    await this.entered(userId);
    return { items: await this.community.safetyInBox(box, now, MAX_ACTIVE_IN_BOX) };
  }
}
