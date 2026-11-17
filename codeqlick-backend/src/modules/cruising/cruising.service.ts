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
import {
  toAccountLocale,
  toDbLocale,
  type AccountLocale,
} from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CruisingProfile } from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService } from '../mail/mail.service.js';
import { AdultAdminService, type AlsoReported } from '../adult/adult-admin.service.js';
import { AdultSafetyService } from '../adult/adult-safety.service.js';
import { AdultVerificationService } from '../adult/adult-verification.service.js';
import { isSeriousCategory } from '../adult/adult.rules.js';
import { sharesContact } from '../swipe/swipe-chat-guard.js';
import {
  cruisingAlertEmail,
  cruisingNoticeEmail,
  cruisingTakedownEmail,
  type CruisingNotice,
} from './cruising-emails.js';
import {
  boxAround,
  citySlugOf,
  DUPLICATE_METERS,
  extractSpotSlug,
  findDuplicate,
  groupPlaces,
  isReservedNickname,
  isSuspended,
  isUniqueViolation,
  memberCanChange,
  nextSpotStatus,
  parseSpotsCsv,
  parseSpotsGeojson,
  placeBbox,
  roundCoordinate,
  searchPatterns,
  spotSlugBase,
  takedownHidesAtOnce,
  toTranscript,
  uniqueSlug,
  type Bbox,
} from './cruising.rules.js';
import {
  contributorBadges,
  spotTimeZone,
  type ContributorBadge,
  type ContributorCounters,
  type SpotTag,
} from './cruising-insights.rules.js';
import { CruisingMediaRepository, type MemberBadge } from './cruising-media.repository.js';
import { mediaHidesAtOnce, normalizeMediaRef, reasonAllowedOn } from './cruising-media.rules.js';
import { CruisingRoomsRepository } from './cruising-rooms.repository.js';
import { roomHidesAtOnce } from './cruising-rooms.rules.js';
import { CruisingNotificationsService } from './cruising-notifications.service.js';
import {
  CruisingMediaService,
  verificationState,
  type VerificationState,
} from './cruising-media.service.js';
import { CruisingRepository } from './cruising.repository.js';
import {
  ageOn,
  CRUISING_MIN_AGE,
  HIDE_AT_ONCE,
  IMPORT_MAX_ROWS,
  MAX_SPOTS_IN_BOX,
  MAX_SPOTS_IN_CITY,
  SEARCH_LIMIT,
  REPORTS_PER_DAY,
  REVIEWS_PER_DAY,
  spotSchema,
  SPOTS_PER_DAY,
  suspensionEnd,
  TRANSCRIPT_LINES,
  type AdminSpotInput,
  type ImportSpotsInput,
  type LookingFor,
  type OnboardingInput,
  type ProfileInput,
  type RemoveMediaInput,
  type ReportActionInput,
  type ReportInput,
  type ReviewInput,
  type SpotInput,
  type SpotPatch,
  type SpotType,
  type SuspendUserInput,
  type TakedownDecision,
  type TakedownInput,
} from './cruising.schemas.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** A nickname someone left stays theirs this long (decision 83). */
const NICKNAME_HOLD_MS = 14 * 24 * 60 * 60 * 1000;
/** Spots given their time zone per batch when the API starts (spots from before phase 5). */
const TIME_ZONE_BATCH = 500;

export interface CruisingStatus {
  onboarded: boolean;
  termsVersion: string;
  acceptedTermsVersion: string | null;
  suspended: boolean;
  suspension: { reason: string | null; until: string | null } | null;
  /** Entered, current terms, not suspended. */
  allowed: boolean;
  emailAlerts: boolean;
  /** Phase 4: the verification photo was approved (the "Verified" badge). */
  verified: boolean;
  /** Phase 4: the state of the verification, with the team's note. */
  verification: VerificationState;
  /** Phase 3 (decision 85): push alerts for favourites (default on). */
  favoriteAlerts: boolean;
  /** Phase 3: the daily email about favourites for members without push (default off). */
  favoriteEmails: boolean;
  /** The VAPID key browsers subscribe with; null while notifications are off. */
  pushPublicKey: string | null;
  /** Phase 6 (decision 102): the onboarding tour was finished or skipped (false: show it). */
  onboardingDone: boolean;
  /** Decision 103: the account's language, Cruising's emails and push texts (GET /cruising/me). */
  locale?: AccountLocale;
  /** Null until a nickname is set. */
  profile: {
    nickname: string;
    bio: string;
    country: string | null;
    lookingFor: LookingFor[];
    showAge: boolean;
    verified: boolean;
    /** Phase 5 (decision 93): the contributor badges and the counters they come from. */
    badges: ContributorBadge[];
    contributions: ContributorCounters;
  } | null;
}

/** How a list names a member: the nickname with the badge and the cover photo (decision 87). */
export interface CruisingMemberRef extends MemberBadge {
  nickname: string;
}

export interface CruisingSpotSummary {
  id: string;
  slug: string;
  name: string;
  type: SpotType;
  lat: number;
  lng: number;
  ratingAvg: number;
  ratingCount: number;
}

/** The map's summary of a spot. */
export function spotSummary(spot: {
  id: string;
  slug: string;
  name: string;
  type: SpotType;
  lat: unknown;
  lng: unknown;
  ratingAvg: unknown;
  ratingCount: number;
}): CruisingSpotSummary {
  return {
    id: spot.id,
    slug: spot.slug,
    name: spot.name,
    type: spot.type,
    lat: Number(spot.lat),
    lng: Number(spot.lng),
    ratingAvg: Number(spot.ratingAvg),
    ratingCount: spot.ratingCount,
  };
}

/** A city a search found (decision 86): the map fits itself to `bbox`. */
export interface CruisingPlaceMatch {
  countryCode: string;
  city: string;
  citySlug: string;
  count: number;
  /** `[minLng, minLat, maxLng, maxLat]`, the box around the city's LIVE spots. */
  bbox: [number, number, number, number];
}

export interface CruisingSpotPublic extends CruisingSpotSummary {
  countryCode: string;
  city: string;
  citySlug: string;
  description: string;
  bestTimes: string | null;
  /** Phase 5 (decision 92). */
  tags: SpotTag[];
  openingHours: string | null;
  tips: string | null;
  createdAt: string;
}

/** A review's author: the member's name, badge and cover, and their contributor badges. */
export interface CruisingReviewAuthor extends CruisingMemberRef {
  badges: ContributorBadge[];
}

export interface CruisingReviewView {
  id: string;
  rating: number;
  text: string | null;
  mine: boolean;
  /** Null: "Member" (an author without a nickname). */
  author: CruisingReviewAuthor | null;
  /** Phase 5 (decision 93): helpful votes, and whether I gave one. */
  helpful: { count: number; mine: boolean };
  createdAt: string;
  updatedAt: string;
}

/** The counters of a profile (zero without one). */
export function countersOf(
  profile: Partial<ContributorCounters> | null | undefined,
): ContributorCounters {
  return {
    spotsLive: profile?.spotsLive ?? 0,
    helpfulReceived: profile?.helpfulReceived ?? 0,
    reviewsWritten: profile?.reviewsWritten ?? 0,
  };
}

/** What a spot's fields become in the database: rounded coordinates and the city's slug. */
export interface SpotChanges {
  name?: string;
  type?: SpotType;
  lat?: number;
  lng?: number;
  countryCode?: string;
  city?: string;
  citySlug?: string;
  description?: string;
  bestTimes?: string | null;
  tags?: SpotTag[];
  openingHours?: string | null;
  tips?: string | null;
  timeZone?: string;
}

export function spotChanges(patch: SpotPatch): SpotChanges {
  const data: SpotChanges = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.type !== undefined) data.type = patch.type;
  if (patch.lat !== undefined) data.lat = roundCoordinate(patch.lat);
  if (patch.lng !== undefined) data.lng = roundCoordinate(patch.lng);
  if (patch.countryCode !== undefined) data.countryCode = patch.countryCode;
  if (patch.city !== undefined) {
    data.city = patch.city;
    data.citySlug = citySlugOf(patch.city);
  }
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.bestTimes !== undefined) data.bestTimes = patch.bestTimes?.trim() || null;
  if (patch.tags !== undefined) data.tags = patch.tags;
  if (patch.openingHours !== undefined) data.openingHours = patch.openingHours?.trim() || null;
  if (patch.tips !== undefined) data.tips = patch.tips?.trim() || null;
  return data;
}

/**
 * A spot's changes with its time zone worked out again when it moves (decision 89): from the new
 * coordinates, or the spot's own for the one the patch leaves alone.
 */
export function spotChangesAt(
  patch: SpotPatch,
  current: { lat: unknown; lng: unknown },
): SpotChanges {
  const data = spotChanges(patch);
  if (data.lat !== undefined || data.lng !== undefined) {
    data.timeZone = spotTimeZone(data.lat ?? Number(current.lat), data.lng ?? Number(current.lng));
  }
  return data;
}

/** The columns of a new spot: rounded coordinates, the city's slug, an empty "best times" as null. */
export function newSpotFields(input: SpotInput) {
  return {
    name: input.name,
    type: input.type,
    lat: roundCoordinate(input.lat),
    lng: roundCoordinate(input.lng),
    countryCode: input.countryCode,
    city: input.city,
    citySlug: citySlugOf(input.city),
    description: input.description,
    bestTimes: input.bestTimes?.trim() || null,
    tags: input.tags ?? [],
    openingHours: input.openingHours?.trim() || null,
    tips: input.tips?.trim() || null,
    timeZone: spotTimeZone(input.lat, input.lng),
  };
}

/** What an import answers (decision 84): `items` were created, or would be on a dry run. */
export interface ImportResult {
  created: number;
  skipped: { row: number; reason: string }[];
  items: { row: number; name: string; city: string; countryCode: string; type: SpotType }[];
}

/** Why a row was refused, from the first problem the proposal's checks found. */
export function issueReason(issue: { path: PropertyKey[]; message: string } | undefined): string {
  if (!issue) return 'Invalid row';
  const field = issue.path.map(String).join('.');
  return field ? `${field}: ${issue.message}` : issue.message;
}

/** What a profile update changes: only the fields the member sent. */
interface ProfileChanges {
  emailAlerts?: boolean;
  favoriteAlerts?: boolean;
  favoriteEmails?: boolean;
  nickname?: string;
  bio?: string;
  country?: string | null;
  lookingFor?: LookingFor[];
  showAge?: boolean;
  onboardingDoneAt?: Date | null;
}

/** The badge of a member for a viewer: no cover for a viewer who can't open profiles (no nickname). */
export function badgeFor(
  badges: Map<string, MemberBadge>,
  userId: string,
  viewerHasNickname: boolean,
): MemberBadge {
  const badge = badges.get(userId);
  return {
    verified: badge?.verified ?? false,
    coverId: viewerHasNickname ? (badge?.coverId ?? null) : null,
  };
}

@Injectable()
export class CruisingService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CruisingService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly repository: CruisingRepository,
    private readonly mediaRepository: CruisingMediaRepository,
    private readonly media: CruisingMediaService,
    private readonly activity: ActivityService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly notifications: CruisingNotificationsService,
    private readonly rooms: CruisingRoomsRepository,
    private readonly safety: AdultSafetyService,
    private readonly verification: AdultVerificationService,
    private readonly adultAdmin: AdultAdminService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    // The team's digest is the one of the three 18+ apps (AdultAdminService, architecture 4.16).
    void this.backfillTimeZones();
  }

  /**
   * Gives the spots created before phase 5 their time zone (decision 89), in batches; runs when the
   * API starts and finds nothing to do once they all have one. Returns how many it set.
   */
  async backfillTimeZones(): Promise<number> {
    let done = 0;
    try {
      for (;;) {
        const batch = await this.repository.spotsWithoutTimeZone(TIME_ZONE_BATCH);
        for (const spot of batch) {
          await this.repository.setSpotTimeZone(
            spot.id,
            spotTimeZone(Number(spot.lat), Number(spot.lng)),
          );
        }
        done += batch.length;
        if (batch.length < TIME_ZONE_BATCH) break;
      }
    } catch (error) {
      this.logger.error(`Cruising time zones not filled in: ${String(error)}`);
    }
    return done;
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers) clearInterval(timer);
  }

  private get cruisingUrl(): string {
    return this.config.webappUrl('cruising');
  }

  private get termsVersion(): string {
    return this.config.cruisingTermsVersion;
  }

  // ---- Background --------------------------------------------------------------------------------

  private alert(kind: 'minor-report' | 'takedown', id: string): void {
    if (!this.config.leadsNotifyTo) return;
    this.sendMail(cruisingAlertEmail(this.config.leadsNotifyTo, kind, id, this.config.siteUrl));
  }

  private sendMail(message: Parameters<MailService['send']>[0]): void {
    this.mail.send(message).catch((error: unknown) => {
      this.logger.error(`Cruising email not sent: ${String(error)}`);
    });
  }

  /**
   * Tells a member about a decision, in their account's language. A published spot respects
   * `emailAlerts`; the team's other decisions are always mailed.
   */
  private async notifyMember(
    userId: string,
    notice: CruisingNotice,
    note: string | null = null,
    until: Date | null = null,
  ): Promise<void> {
    try {
      const user = await this.repository.recipient(userId);
      if (!user) return;
      if (notice === 'spot-live' && user.cruisingProfile?.emailAlerts === false) return;
      this.sendMail(
        cruisingNoticeEmail(
          user.email,
          toAccountLocale(user.locale),
          notice,
          note,
          this.cruisingUrl,
          this.config.siteUrl,
          until,
        ),
      );
    } catch (error) {
      this.logger.error(`Cruising notice not sent: ${String(error)}`);
    }
  }

  // ---- Status and entry --------------------------------------------------------------------------

  async status(userId: string, now = new Date()): Promise<CruisingStatus> {
    const [profile, locale] = await Promise.all([
      this.repository.findProfile(userId),
      this.repository.accountLocale(userId),
    ]);
    return { ...(await this.statusOf(userId, profile, now)), locale: toAccountLocale(locale) };
  }

  private async statusOf(
    userId: string,
    profile: CruisingProfile | null,
    now: Date,
  ): Promise<CruisingStatus> {
    const onboarded = !!profile && profile.termsVersion === this.termsVersion;
    // A shared suspension (architecture 4.16) counts even before the person entered Cruising.
    const shared = isSuspended(profile, now) ? null : await this.safety.sharedState(userId, now);
    const suspended = isSuspended(profile, now) || !!shared;
    // The account's one verification for the three 18+ apps (decision 113).
    const verification = await this.verification.view(userId);
    const verified = verification.status === 'APPROVED';
    return {
      onboarded,
      termsVersion: this.termsVersion,
      acceptedTermsVersion: profile?.termsVersion ?? null,
      suspended,
      suspension: shared
        ? { reason: shared.reason, until: shared.until?.toISOString() ?? null }
        : suspended
          ? {
              reason: profile?.suspensionReason ?? null,
              until: profile?.suspendedUntil?.toISOString() ?? null,
            }
          : null,
      allowed: onboarded && !suspended,
      emailAlerts: profile?.emailAlerts ?? true,
      verified,
      verification: verificationState(verification),
      favoriteAlerts: profile?.favoriteAlerts ?? true,
      favoriteEmails: profile?.favoriteEmails ?? false,
      pushPublicKey: this.config.vapid?.publicKey ?? null,
      onboardingDone: !!profile?.onboardingDoneAt,
      profile: profile?.nickname
        ? {
            nickname: profile.nickname,
            bio: profile.bio,
            country: profile.country,
            lookingFor: profile.lookingFor,
            showAge: profile.showAge,
            verified,
            badges: contributorBadges(countersOf(profile)),
            contributions: countersOf(profile),
          }
        : null,
    };
  }

  /** Checks 18+ (the date of birth is not stored) and records the accepted rules and consent. */
  async onboard(userId: string, input: OnboardingInput, now = new Date()): Promise<CruisingStatus> {
    if (input.termsVersion !== this.termsVersion) {
      throw new ConflictException('The rules changed: read them again');
    }
    const age = ageOn(input.birthDate, now);
    if (age < CRUISING_MIN_AGE) {
      throw new ForbiddenException('Cruising is only for people aged 18 or over');
    }
    if (age > 120) throw new BadRequestException('Check the date of birth');
    const user = await this.repository.findUser(userId);
    // An email kept after a serious suspension can't enter (decision 120).
    if (user) await this.safety.checkEntry(user.email, now);
    const birthYear = Number(input.birthDate.slice(0, 4));
    await this.repository.saveOnboarding(userId, this.termsVersion, birthYear, now);
    // A shared suspension in force applies here too, from the first visit (decision 114).
    await this.safety.reapply(userId, now, ['CRUISING']);
    return this.statusOf(userId, await this.repository.findProfile(userId), now);
  }

  async updateProfile(
    userId: string,
    input: ProfileInput,
    now = new Date(),
    role: AuthUser['role'] = 'CLIENT',
  ): Promise<CruisingStatus> {
    const current = await this.enteredProfile(userId);
    // Reserved words pose as the team or the platform: only the team's admins may take them, as
    // with usernames (the account's username check lets admins through too).
    if (input.nickname !== undefined && role !== 'ADMIN' && isReservedNickname(input.nickname)) {
      throw new BadRequestException('This nickname is not available');
    }
    const data: ProfileChanges = {};
    if (input.emailAlerts !== undefined) data.emailAlerts = input.emailAlerts;
    if (input.favoriteAlerts !== undefined) data.favoriteAlerts = input.favoriteAlerts;
    if (input.favoriteEmails !== undefined) data.favoriteEmails = input.favoriteEmails;
    if (input.bio !== undefined) {
      if (sharesContact(input.bio)) {
        throw new BadRequestException(
          'Your bio cannot share contact details: no phone numbers, emails, links or social handles',
        );
      }
      data.bio = input.bio;
    }
    if (input.country !== undefined) data.country = input.country;
    if (input.lookingFor !== undefined) data.lookingFor = input.lookingFor;
    if (input.showAge !== undefined) data.showAge = input.showAge;
    // Phase 6 (decision 102): "Done" or "Skip" ends the tour; false reopens it (from /me).
    if (input.onboardingDone !== undefined) {
      data.onboardingDoneAt = input.onboardingDone ? (current.onboardingDoneAt ?? now) : null;
    }
    // A nickname can be changed whenever the member wants, like on Instagram (decision 83). The one
    // left stays its owner's for 14 days, so nobody can pose as them right after a change.
    const changing =
      input.nickname !== undefined &&
      current.nickname !== null &&
      input.nickname !== current.nickname;
    if (input.nickname !== undefined && input.nickname !== current.nickname) {
      const since = new Date(now.getTime() - NICKNAME_HOLD_MS);
      const owner = await this.repository.findProfileByNickname(input.nickname);
      const reservedFor = await this.repository.nicknameReservedFor(input.nickname, since);
      if ((owner && owner.userId !== userId) || (reservedFor !== null && reservedFor !== userId)) {
        throw new ConflictException('This nickname is taken');
      }
      data.nickname = input.nickname;
    }
    try {
      const saved =
        changing && current.nickname
          ? await this.repository.updateProfileChangingNickname(userId, data, current.nickname, now)
          : await this.repository.updateProfile(userId, data);
      // The badge (and a photo waiting for review) is about the name on the paper: when it is no
      // longer one of the account's names it goes, in the three 18+ apps (decisions 87 and 113).
      if (data.nickname !== undefined) await this.verification.nameChanged(userId, now);
      return this.statusOf(userId, saved, now);
    } catch (error) {
      // Two people saving the same nickname together: the unique index settles it.
      if (isUniqueViolation(error)) throw new ConflictException('This nickname is taken');
      throw error;
    }
  }

  /** A member who has entered with the current rules (a suspended one can still read). */
  private async enteredProfile(userId: string): Promise<CruisingProfile> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || profile.termsVersion !== this.termsVersion) {
      throw new ForbiddenException('Confirm your age and accept the rules first');
    }
    return profile;
  }

  /** A member who may propose, review and report now, or the reason they can't. */
  private async allowedProfile(userId: string, now: Date): Promise<CruisingProfile> {
    const profile = await this.enteredProfile(userId);
    if (isSuspended(profile, now)) throw new ForbiddenException('Your account is suspended');
    return profile;
  }

  // ---- Public: the map, places and spot pages ----------------------------------------------------

  private summary(spot: Parameters<typeof spotSummary>[0]): CruisingSpotSummary {
    return spotSummary(spot);
  }

  /** Up to 500 LIVE spots in the box; `truncated` when there were more. */
  async spotsInBox(
    box: Bbox,
    type?: SpotType,
    minRating?: number,
    tags?: SpotTag[],
  ): Promise<{ items: CruisingSpotSummary[]; truncated: boolean }> {
    const spots = await this.repository.spotsInBox(
      box,
      { type, minRating, tags },
      MAX_SPOTS_IN_BOX + 1,
    );
    return {
      items: spots.slice(0, MAX_SPOTS_IN_BOX).map((spot) => this.summary(spot)),
      truncated: spots.length > MAX_SPOTS_IN_BOX,
    };
  }

  /**
   * Cities and spots by text (decision 86), LIVE only, up to 8 of each: accents and case are
   * ignored, matches at the start come first. Nothing about the searcher's position is involved.
   */
  async search(
    text: string,
  ): Promise<{ places: CruisingPlaceMatch[]; spots: CruisingSpotSummary[] }> {
    const { contains, prefix } = searchPatterns(text);
    const [cities, spots] = await Promise.all([
      this.repository.searchCities(contains, prefix, SEARCH_LIMIT),
      this.repository.searchSpots(contains, prefix, SEARCH_LIMIT),
    ]);
    return {
      places: cities.map((row) => ({
        countryCode: row.country_code,
        city: row.city,
        citySlug: row.city_slug,
        count: Number(row.count),
        bbox: placeBbox({
          minLng: row.min_lng,
          minLat: row.min_lat,
          maxLng: row.max_lng,
          maxLat: row.max_lat,
        }),
      })),
      spots: spots.map((row) =>
        this.summary({
          ...row,
          ratingAvg: row.rating_avg,
          ratingCount: Number(row.rating_count),
        }),
      ),
    };
  }

  async spotBySlug(slug: string): Promise<CruisingSpotPublic> {
    const spot = await this.repository.findSpotBySlug(slug);
    if (!spot || spot.status !== 'LIVE') throw new NotFoundException('Spot not found');
    return {
      ...this.summary(spot),
      countryCode: spot.countryCode,
      city: spot.city,
      citySlug: spot.citySlug,
      description: spot.description,
      bestTimes: spot.bestTimes,
      tags: spot.tags,
      openingHours: spot.openingHours,
      tips: spot.tips,
      createdAt: spot.createdAt.toISOString(),
    };
  }

  /** Countries with their cities, most spots first. */
  async places() {
    return { countries: groupPlaces(await this.repository.liveCityCounts()) };
  }

  async cityPage(countryCode: string, citySlug: string) {
    const spots = await this.repository.citySpots(countryCode, citySlug, MAX_SPOTS_IN_CITY);
    const first = spots[0];
    if (!first) throw new NotFoundException('No spots in this city');
    return {
      countryCode,
      city: first.city,
      citySlug,
      items: spots.map((spot) => this.summary(spot)),
    };
  }

  async sitemap() {
    const spots = await this.repository.sitemapSpots();
    return {
      items: spots.map((spot) => ({
        slug: spot.slug,
        countryCode: spot.countryCode,
        citySlug: spot.citySlug,
        updatedAt: spot.updatedAt.toISOString(),
      })),
    };
  }

  // ---- Members: spots ----------------------------------------------------------------------------

  /** The spots I proposed, newest first. */
  async mySpots(userId: string) {
    const spots = await this.repository.mySpots(userId);
    return {
      items: spots.map((spot) => ({
        id: spot.id,
        slug: spot.slug,
        name: spot.name,
        type: spot.type,
        status: spot.status,
        rejectReason: spot.rejectReason,
        countryCode: spot.countryCode,
        city: spot.city,
        ratingAvg: Number(spot.ratingAvg),
        ratingCount: spot.ratingCount,
        createdAt: spot.createdAt.toISOString(),
        lat: Number(spot.lat),
        lng: Number(spot.lng),
        description: spot.description,
        bestTimes: spot.bestTimes,
        tags: spot.tags,
        openingHours: spot.openingHours,
        tips: spot.tips,
      })),
    };
  }

  /** A member proposes a spot (up to 5 a day). It starts PENDING: only the team publishes it. */
  async proposeSpot(
    userId: string,
    input: SpotInput,
    now = new Date(),
  ): Promise<{ id: string; slug: string; status: 'PENDING' }> {
    await this.allowedProfile(userId, now);
    const today = await this.repository.countSpotsSince(userId, new Date(now.getTime() - DAY_MS));
    if (today >= SPOTS_PER_DAY) {
      throw new HttpException('You can propose 5 spots a day', HttpStatus.TOO_MANY_REQUESTS);
    }
    const spot = await this.createWithSlug(input, { status: 'PENDING', createdById: userId });
    return { id: spot.id, slug: spot.slug, status: 'PENDING' };
  }

  /** A new spot with its own slug, looked for again when someone takes it meanwhile. */
  private async createWithSlug(
    input: SpotInput,
    extra: { status: 'PENDING' | 'LIVE'; createdById: string | null; reviewedAt?: Date },
  ) {
    const fields = newSpotFields(input);
    const base = spotSlugBase(input.name);
    for (let attempt = 1; ; attempt += 1) {
      const slug = await uniqueSlug(base, (candidate) => this.repository.slugTaken(candidate));
      try {
        return await this.repository.createSpot({ ...fields, slug, ...extra });
      } catch (error) {
        // Someone took the slug between the check and the write: look again.
        if (!isUniqueViolation(error) || attempt >= 3) throw error;
      }
    }
  }

  private async mySpot(userId: string, spotId: string) {
    const spot = await this.repository.findSpot(spotId);
    if (!spot || spot.createdById !== userId) throw new NotFoundException('Spot not found');
    return spot;
  }

  /** The proposer edits a PENDING or REJECTED spot; a REJECTED one goes back to PENDING. */
  async editSpot(
    userId: string,
    spotId: string,
    patch: SpotPatch,
    now = new Date(),
  ): Promise<{
    id: string;
    slug: string;
    status: 'PENDING' | 'LIVE' | 'REJECTED' | 'HIDDEN' | 'REMOVED';
  }> {
    await this.allowedProfile(userId, now);
    const spot = await this.mySpot(userId, spotId);
    if (!memberCanChange(spot.status)) {
      throw new ConflictException('Only a pending or rejected spot can be changed');
    }
    const updated = await this.repository.updateOwnSpot(spot.id, userId, {
      ...spotChangesAt(patch, spot),
      ...(spot.status === 'REJECTED' ? { status: 'PENDING' as const, rejectReason: null } : {}),
    });
    // The team decided in between: it can't be changed any more.
    if (!updated) throw new ConflictException('Only a pending or rejected spot can be changed');
    return { id: updated.id, slug: updated.slug, status: updated.status };
  }

  async deleteSpot(userId: string, spotId: string): Promise<void> {
    const spot = await this.mySpot(userId, spotId);
    if (!memberCanChange(spot.status) || !(await this.repository.deleteOwnSpot(spot.id, userId))) {
      throw new ConflictException('Only a pending or rejected spot can be deleted');
    }
  }

  // ---- Members: reviews --------------------------------------------------------------------------

  private async liveSpot(spotId: string) {
    const spot = await this.repository.findSpot(spotId);
    if (!spot || spot.status !== 'LIVE') throw new NotFoundException('Spot not found');
    return spot;
  }

  private reviewView(
    review: {
      id: string;
      rating: number;
      text: string | null;
      userId: string;
      createdAt: Date;
      updatedAt: Date;
    },
    viewerId: string,
    nickname: string | null,
    badge: MemberBadge,
    counters: Partial<ContributorCounters> | null,
    helpful: { count: number; mine: boolean },
  ): CruisingReviewView {
    return {
      id: review.id,
      rating: review.rating,
      text: review.text,
      mine: review.userId === viewerId,
      author: nickname
        ? { nickname, ...badge, badges: contributorBadges(countersOf(counters)) }
        : null,
      helpful,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
    };
  }

  /** The reviews of a LIVE spot: only for a member who has entered; never those of people blocked either way. */
  async reviews(
    userId: string,
    spotId: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<CruisingReviewView>> {
    const me = await this.enteredProfile(userId);
    await this.liveSpot(spotId);
    const { skip, take } = pageToSkipTake(page, pageSize);
    const hidden = await this.repository.hiddenIds(userId);
    const { items, total } = await this.repository.reviewsOfSpot(
      spotId,
      skip,
      take,
      hidden,
      userId,
    );
    const badges = await this.mediaRepository.badges(items.map((review) => review.userId));
    return paginate(
      items.map((review) =>
        this.reviewView(
          review,
          userId,
          review.nickname,
          badgeFor(badges, review.userId, !!me.nickname),
          review.counters,
          { count: review.helpful, mine: review.helpfulMine },
        ),
      ),
      total,
      page,
      pageSize,
    );
  }

  /** Creates or replaces my review of a LIVE spot (10 a day, creating or editing). */
  async saveReview(
    userId: string,
    spotId: string,
    input: ReviewInput,
    now = new Date(),
  ): Promise<CruisingReviewView> {
    const me = await this.allowedProfile(userId, now);
    await this.liveSpot(spotId);
    if (input.text && sharesContact(input.text)) {
      throw new BadRequestException(
        'Reviews cannot share contact details: no phone numbers, emails, links or social handles',
      );
    }
    const touched = await this.repository.countReviewsTouchedSince(
      userId,
      new Date(now.getTime() - DAY_MS),
    );
    const existing = await this.repository.findReview(spotId, userId);
    // Editing a review I already touched today doesn't add to the count.
    const adds = existing && existing.updatedAt.getTime() >= now.getTime() - DAY_MS ? 0 : 1;
    if (touched + adds > REVIEWS_PER_DAY) {
      throw new HttpException('Too many reviews today', HttpStatus.TOO_MANY_REQUESTS);
    }
    const review = await this.repository.saveReview(
      spotId,
      userId,
      input.rating,
      input.text ?? null,
    );
    const [badges, profile, helpful] = await Promise.all([
      this.mediaRepository.badges([userId]),
      this.repository.findProfile(userId),
      this.repository.countHelpfulVotes(review.id),
    ]);
    return this.reviewView(
      review,
      userId,
      me.nickname,
      badgeFor(badges, userId, !!me.nickname),
      profile,
      { count: helpful, mine: false },
    );
  }

  async deleteReview(userId: string, spotId: string): Promise<void> {
    const review = await this.repository.findReview(spotId, userId);
    if (!review) throw new NotFoundException('Review not found');
    await this.repository.deleteReview(review.id);
  }

  // ---- Reports and removal requests --------------------------------------------------------------

  /**
   * A member reports a spot, a review, a profile or a conversation. MINOR and ILLEGAL hide a spot
   * or review at once; a conversation's last messages are saved with the report.
   */
  async report(userId: string, input: ReportInput, now = new Date()): Promise<void> {
    await this.allowedProfile(userId, now);
    const target = input.spotId
      ? 'spot'
      : input.reviewId
        ? 'review'
        : input.nickname
          ? 'profile'
          : input.mediaId
            ? 'media'
            : input.meetupId
              ? 'meetup'
              : input.alertId
                ? 'alert'
                : input.roomMessageId
                  ? 'room_message'
                  : 'conversation';
    if (input.reason === 'WRONG_INFO' && !input.spotId) {
      throw new BadRequestException('Wrong information can only be reported on a spot');
    }
    if (!reasonAllowedOn(target, input.reason)) {
      throw new BadRequestException('This reason does not apply to what you are reporting');
    }
    const today = await this.repository.countReportsSince(userId, new Date(now.getTime() - DAY_MS));
    if (today >= REPORTS_PER_DAY) {
      throw new HttpException('Too many reports today', HttpStatus.TOO_MANY_REQUESTS);
    }
    const hide = HIDE_AT_ONCE.includes(input.reason);
    const common = { reporterId: userId, reason: input.reason, details: input.details || null };
    let reportId: string;
    if (input.spotId) {
      const spot = await this.liveSpot(input.spotId);
      const report = await this.repository.createReport({
        ...common,
        targetType: 'SPOT',
        spotId: spot.id,
        reportedId: spot.createdById,
        createdAt: now,
      });
      reportId = report.id;
      if (hide) await this.repository.updateSpot(spot.id, { status: 'HIDDEN' });
    } else if (input.reviewId) {
      const review = await this.repository.findReviewById(input.reviewId);
      if (
        !review ||
        review.userId === userId ||
        review.status !== 'LIVE' ||
        review.spot.status !== 'LIVE'
      ) {
        throw new NotFoundException('Review not found');
      }
      const report = await this.repository.createReport({
        ...common,
        targetType: 'REVIEW',
        reviewId: review.id,
        reportedId: review.userId,
        createdAt: now,
      });
      reportId = report.id;
      if (hide) await this.repository.setReviewStatus(review.id, 'HIDDEN');
    } else if (input.nickname) {
      // A person I blocked can still be reported, so blocks and suspensions don't hide them here.
      const target = await this.repository.findProfileByNickname(input.nickname);
      if (!target || target.userId === userId) throw new NotFoundException('Member not found');
      const report = await this.repository.createReport({
        ...common,
        targetType: 'PROFILE',
        reportedId: target.userId,
        createdAt: now,
      });
      reportId = report.id;
    } else if (input.mediaId) {
      // Only what the reporter can see: a LIVE item of someone else, not blocked, not suspended.
      const item = await this.mediaRepository.findMedia(input.mediaId);
      if (
        !item ||
        item.ownerId === userId ||
        !(await this.media.visibleTo({ id: userId, isAdmin: false }, item, now))
      ) {
        throw new NotFoundException('Not found');
      }
      const report = await this.repository.createReport({
        ...common,
        targetType: 'MEDIA',
        mediaId: item.id,
        reportedId: item.ownerId,
        createdAt: now,
      });
      reportId = report.id;
      if (mediaHidesAtOnce(input.reason)) await this.media.hide(item.id);
    } else if (input.meetupId) {
      // Phase 5 (decision 88): someone else's meetup that is up.
      const meetup = await this.repository.findMeetupForReport(input.meetupId);
      if (
        !meetup ||
        meetup.hostId === userId ||
        meetup.status !== 'LIVE' ||
        meetup.spot.status !== 'LIVE'
      ) {
        throw new NotFoundException('Meetup not found');
      }
      const report = await this.repository.createReport({
        ...common,
        targetType: 'MEETUP',
        meetupId: meetup.id,
        reportedId: meetup.hostId,
        createdAt: now,
      });
      reportId = report.id;
      if (hide) await this.repository.setMeetupStatus(meetup.id, 'HIDDEN');
    } else if (input.alertId) {
      // Phase 5 (decision 91): an active alert someone else posted. The poster is kept for the
      // team only.
      const alert = await this.repository.findSafetyAlertForReport(input.alertId);
      if (
        !alert ||
        alert.posterId === userId ||
        alert.hidden ||
        alert.expiresAt <= now ||
        alert.spot.status !== 'LIVE'
      ) {
        throw new NotFoundException('Alert not found');
      }
      const report = await this.repository.createReport({
        ...common,
        targetType: 'ALERT',
        safetyAlertId: alert.id,
        reportedId: alert.posterId,
        createdAt: now,
      });
      reportId = report.id;
      if (hide) await this.repository.setSafetyAlertHidden(alert.id, true);
    } else if (input.roomMessageId) {
      // Phase 6 (decision 100): someone else's message that is up; its text goes with the report,
      // since messages are deleted after 7 days.
      const message = await this.rooms.findMessage(input.roomMessageId);
      if (!message || message.userId === userId || message.hidden) {
        throw new NotFoundException('Message not found');
      }
      const report = await this.repository.createReport({
        ...common,
        targetType: 'ROOM_MESSAGE',
        roomMessageId: message.id,
        reportedId: message.userId,
        transcript: toTranscript([{ ...message, senderId: message.userId }], userId),
        createdAt: now,
      });
      reportId = report.id;
      if (roomHidesAtOnce(input.reason)) await this.rooms.setHidden(message.id, true);
    } else {
      const conversation = await this.repository.findConversation(input.conversationId as string);
      if (!conversation || (conversation.userAId !== userId && conversation.userBId !== userId)) {
        throw new NotFoundException('Conversation not found');
      }
      const partnerId =
        conversation.userAId === userId ? conversation.userBId : conversation.userAId;
      const messages = await this.repository.lastMessages(conversation.id, TRANSCRIPT_LINES);
      const report = await this.repository.createReport({
        ...common,
        targetType: 'CONVERSATION',
        reportedId: partnerId,
        transcript: toTranscript(messages, userId),
        createdAt: now,
      });
      reportId = report.id;
    }
    if (input.reason === 'MINOR') this.alert('minor-report', reportId);
  }

  /** A removal request from anyone. The LIVE spot its link names is hidden at once. */
  async takedown(input: TakedownInput, now = new Date()): Promise<{ id: string }> {
    // The honeypot: pretend it worked.
    if (input.website) return { id: '00000000-0000-0000-0000-000000000000' };
    const slug = input.spotLink ? extractSpotSlug(input.spotLink) : null;
    const spot = slug ? await this.repository.findSpotBySlug(slug) : null;
    const mediaRef = normalizeMediaRef(input.mediaRef);
    const media = mediaRef ? await this.mediaRepository.findByRef(mediaRef) : null;
    const request = await this.repository.createTakedown({
      email: input.email,
      spotLink: input.spotLink || null,
      spotId: spot?.id ?? null,
      mediaRef: mediaRef ?? (input.mediaRef?.slice(0, 12) || null),
      mediaId: media?.id ?? null,
      reason: input.reason,
      details: input.details,
      locale: toDbLocale(input.locale),
      createdAt: now,
    });
    // Only a minor or something illegal hides the spot at once; anything else waits for the team.
    if (spot?.status === 'LIVE' && takedownHidesAtOnce(input.reason)) {
      await this.repository.updateSpot(spot.id, { status: 'HIDDEN' });
    }
    // A photo or video: also for missing consent or a stolen image (decision 87).
    if (media && mediaHidesAtOnce(input.reason)) await this.media.hide(media.id);
    this.alert('takedown', request.id);
    this.sendMail(
      cruisingTakedownEmail(
        input.email,
        input.locale,
        'received',
        request.id,
        null,
        this.config.siteUrl,
      ),
    );
    return { id: request.id };
  }

  // ---- Admin: spots ------------------------------------------------------------------------------

  overview(now = new Date()) {
    return this.repository.overview(now);
  }

  async adminSpots(status: 'PENDING' | 'LIVE' | 'REJECTED' | 'HIDDEN' | 'REMOVED', q?: string) {
    const spots = await this.repository.adminSpots(status, q || undefined);
    return spots.map((spot) => ({
      id: spot.id,
      slug: spot.slug,
      name: spot.name,
      type: spot.type,
      status: spot.status,
      lat: Number(spot.lat),
      lng: Number(spot.lng),
      countryCode: spot.countryCode,
      city: spot.city,
      description: spot.description,
      bestTimes: spot.bestTimes,
      tags: spot.tags,
      openingHours: spot.openingHours,
      tips: spot.tips,
      rejectReason: spot.rejectReason,
      ratingAvg: Number(spot.ratingAvg),
      ratingCount: spot.ratingCount,
      createdBy: spot.createdBy
        ? { userId: spot.createdBy.id, name: spot.createdBy.name, email: spot.createdBy.email }
        : null,
      openReports: spot._count.reports,
      createdAt: spot.createdAt.toISOString(),
    }));
  }

  private async anySpot(spotId: string) {
    const spot = await this.repository.findSpot(spotId);
    if (!spot) throw new NotFoundException('Spot not found');
    return spot;
  }

  /**
   * The team adds a spot itself (decision 84): a proposal's checks, LIVE at once (PENDING when
   * `publish` is false) and no proposer, so nobody is emailed.
   */
  async createTeamSpot(
    actor: AuthUser,
    input: AdminSpotInput,
    now = new Date(),
  ): Promise<{ id: string; slug: string; status: 'LIVE' | 'PENDING' }> {
    const { publish, ...spot } = input;
    const status = publish ? 'LIVE' : 'PENDING';
    const created = await this.createWithSlug(spot, {
      status,
      createdById: null,
      ...(publish ? { reviewedAt: now } : {}),
    });
    await this.activity.record(actor, {
      action: 'cruising.spot_created',
      targetId: created.id,
      targetLabel: created.slug,
      details: { status },
    });
    return { id: created.id, slug: created.slug, status };
  }

  /**
   * Imports spots from a CSV or GeoJSON file (decision 84). Each row is checked like a proposal and
   * skipped, with its reason, when invalid or a duplicate (same type within 100 m of a spot that
   * isn't REJECTED or REMOVED, or of an earlier row). A dry run creates nothing; the real run
   * creates the valid rows in one transaction and records one activity entry.
   */
  async importSpots(
    actor: AuthUser,
    input: ImportSpotsInput,
    now = new Date(),
  ): Promise<ImportResult> {
    const parsed =
      input.format === 'csv' ? parseSpotsCsv(input.content) : parseSpotsGeojson(input.content);
    if (!parsed.ok) throw new BadRequestException(parsed.error);
    if (parsed.rows.length === 0) throw new BadRequestException('The file has no rows');
    if (parsed.rows.length > IMPORT_MAX_ROWS) {
      throw new BadRequestException(`A file can hold up to ${IMPORT_MAX_ROWS} rows`);
    }

    const skipped: ImportResult['skipped'] = [];
    const accepted: { row: number; input: SpotInput; fields: ReturnType<typeof newSpotFields> }[] =
      [];
    for (const { row, fields, error } of parsed.rows) {
      if (!fields) {
        skipped.push({ row, reason: error ?? 'Unreadable row' });
        continue;
      }
      const checked = spotSchema.safeParse(fields);
      if (!checked.success) {
        skipped.push({ row, reason: issueReason(checked.error.issues[0]) });
        continue;
      }
      const spot = newSpotFields(checked.data);
      const earlier = findDuplicate(
        spot,
        accepted.map((each) => ({ ...each.fields, row: each.row })),
      );
      if (earlier) {
        skipped.push({ row, reason: `Duplicate of row ${earlier.row} (within 100 m)` });
        continue;
      }
      const existing = findDuplicate(
        spot,
        await this.repository.possibleDuplicates(boxAround(spot, DUPLICATE_METERS), spot.type),
      );
      if (existing) {
        skipped.push({ row, reason: `Duplicate of "${existing.name}" (within 100 m)` });
        continue;
      }
      accepted.push({ row, input: checked.data, fields: spot });
    }

    const items = accepted.map(({ row, fields }) => ({
      row,
      name: fields.name,
      city: fields.city,
      countryCode: fields.countryCode,
      type: fields.type,
    }));
    if (input.dryRun || accepted.length === 0) return { created: 0, skipped, items };

    const status: 'LIVE' | 'PENDING' = input.publish ? 'LIVE' : 'PENDING';
    for (let attempt = 1; ; attempt += 1) {
      // Each row its own slug: free in the database and not given to an earlier row.
      const taken = new Set<string>();
      const rows = [];
      for (const { fields } of accepted) {
        const slug = await uniqueSlug(
          spotSlugBase(fields.name),
          async (candidate) => taken.has(candidate) || (await this.repository.slugTaken(candidate)),
        );
        taken.add(slug);
        rows.push({
          ...fields,
          slug,
          status,
          createdById: null,
          ...(input.publish ? { reviewedAt: now } : {}),
        });
      }
      try {
        await this.repository.createSpots(rows);
        break;
      } catch (error) {
        // Someone took a slug between the check and the write: look again.
        if (!isUniqueViolation(error) || attempt >= 3) throw error;
      }
    }
    await this.activity.record(actor, {
      action: 'cruising.spots_imported',
      targetLabel: `${accepted.length} spots`,
      details: {
        created: accepted.length,
        skipped: skipped.length,
        format: input.format,
        status,
      },
    });
    return { created: accepted.length, skipped, items };
  }

  /** The team corrects a spot's fields. The slug stays. */
  async correctSpot(actor: AuthUser, spotId: string, patch: SpotPatch): Promise<void> {
    const spot = await this.anySpot(spotId);
    await this.repository.updateSpot(spot.id, spotChangesAt(patch, spot));
    await this.activity.record(actor, {
      action: 'cruising.spot_edited',
      targetId: spot.id,
      targetLabel: spot.slug,
      details: { fields: Object.keys(patch) },
    });
  }

  /** Publishes a spot; its proposer is told (unless they turned those emails off). */
  async approveSpot(actor: AuthUser, spotId: string, now = new Date()): Promise<void> {
    const spot = await this.anySpot(spotId);
    if (!nextSpotStatus(spot.status, 'approve')) throw new ConflictException('Already live');
    await this.repository.updateSpot(spot.id, {
      status: 'LIVE',
      rejectReason: null,
      reviewedAt: now,
    });
    await this.activity.record(actor, {
      action: 'cruising.spot_approved',
      targetId: spot.id,
      targetLabel: spot.slug,
    });
    // Putting a hidden spot back is not news to the proposer.
    if (spot.createdById && spot.status !== 'HIDDEN') {
      await this.notifyMember(spot.createdById, 'spot-live');
      await this.notifications.notify(spot.createdById, 'SPOT_PUBLISHED', { spotId: spot.id }, now);
    }
  }

  async hideSpot(actor: AuthUser, spotId: string, now = new Date()): Promise<void> {
    const spot = await this.anySpot(spotId);
    if (!nextSpotStatus(spot.status, 'hide')) throw new ConflictException('Only a live spot');
    await this.repository.updateSpot(spot.id, { status: 'HIDDEN', reviewedAt: now });
    await this.activity.record(actor, {
      action: 'cruising.spot_hidden',
      targetId: spot.id,
      targetLabel: spot.slug,
    });
  }

  async rejectSpot(
    actor: AuthUser,
    spotId: string,
    reason: string,
    now = new Date(),
  ): Promise<void> {
    await this.rejectLoaded(actor, await this.anySpot(spotId), reason, now);
  }

  private async rejectLoaded(
    actor: AuthUser,
    spot: {
      id: string;
      slug: string;
      status: 'PENDING' | 'LIVE' | 'REJECTED' | 'HIDDEN' | 'REMOVED';
      createdById: string | null;
    },
    reason: string,
    now: Date,
  ): Promise<void> {
    if (!nextSpotStatus(spot.status, 'reject')) throw new ConflictException('Already rejected');
    await this.repository.updateSpot(spot.id, {
      status: 'REJECTED',
      rejectReason: reason,
      reviewedAt: now,
    });
    await this.activity.record(actor, {
      action: 'cruising.spot_rejected',
      targetId: spot.id,
      targetLabel: spot.slug,
      details: { reason },
    });
    if (spot.createdById) {
      await this.notifyMember(spot.createdById, 'spot-rejected', reason);
      await this.notifications.notify(spot.createdById, 'SPOT_REJECTED', { spotId: spot.id }, now);
    }
  }

  /** Removed by moderation after a report: final, the proposer sees it removed and can't resend it. */
  private async removeLoaded(
    actor: AuthUser,
    spot: { id: string; slug: string; createdById: string | null },
    reason: string,
    now: Date,
  ): Promise<void> {
    await this.repository.updateSpot(spot.id, {
      status: 'REMOVED',
      rejectReason: reason,
      reviewedAt: now,
    });
    await this.activity.record(actor, {
      action: 'cruising.spot_removed',
      targetId: spot.id,
      targetLabel: spot.slug,
      details: { reason },
    });
    if (spot.createdById) {
      await this.notifyMember(spot.createdById, 'spot-removed', reason);
      await this.notifications.notify(spot.createdById, 'SPOT_REMOVED', { spotId: spot.id }, now);
    }
  }

  // ---- Admin: reports ----------------------------------------------------------------------------

  async reports(status: 'OPEN' | 'DISMISSED' | 'ACTIONED') {
    const reports = await this.repository.reports(status);
    const people = [
      ...new Set(reports.flatMap((report) => (report.reportedId ? [report.reportedId] : []))),
    ];
    const [counts, verified, elsewhere] = await Promise.all([
      this.repository.reportCounts(people),
      this.verification.verifiedAmong(people),
      this.adultAdmin.alsoReported('CRUISING', people),
    ]);
    return reports.map((report) => ({
      id: report.id,
      targetType: report.targetType,
      reason: report.reason,
      details: report.details,
      transcript: report.transcript,
      status: report.status,
      createdAt: report.createdAt.toISOString(),
      reviewedAt: report.reviewedAt?.toISOString() ?? null,
      reviewedBy: report.reviewedBy,
      target:
        report.targetType === 'SPOT' && report.spot
          ? { type: 'SPOT' as const, spot: report.spot }
          : report.targetType === 'REVIEW' && report.review
            ? { type: 'REVIEW' as const, review: report.review }
            : report.targetType === 'PROFILE'
              ? {
                  type: 'PROFILE' as const,
                  nickname: report.reported?.cruisingProfile?.nickname ?? null,
                }
              : report.targetType === 'CONVERSATION'
                ? { type: 'CONVERSATION' as const }
                : report.targetType === 'MEDIA'
                  ? { type: 'MEDIA' as const, media: report.media }
                  : report.targetType === 'MEETUP' && report.meetup
                    ? {
                        type: 'MEETUP' as const,
                        meetup: {
                          ...report.meetup,
                          startsAt: report.meetup.startsAt.toISOString(),
                        },
                      }
                    : report.targetType === 'ALERT' && report.safetyAlert
                      ? {
                          type: 'ALERT' as const,
                          alert: {
                            ...report.safetyAlert,
                            expiresAt: report.safetyAlert.expiresAt.toISOString(),
                          },
                        }
                      : report.targetType === 'ROOM_MESSAGE'
                        ? { type: 'ROOM_MESSAGE' as const, roomMessage: report.roomMessage }
                        : null,
      reporter: {
        userId: report.reporter.id,
        name: report.reporter.name,
        email: report.reporter.email,
        nickname: report.reporter.cruisingProfile?.nickname ?? null,
      },
      reported: report.reported
        ? {
            userId: report.reported.id,
            name: report.reported.name,
            email: report.reported.email,
            nickname: report.reported.cruisingProfile?.nickname ?? null,
            verified: verified.has(report.reported.id),
            suspended: isSuspended(report.reported.cruisingProfile),
            reports: counts.get(report.reported.id) ?? 0,
            alsoReported: elsewhere.get(report.reported.id) ?? (null as AlsoReported | null),
            roomMutedUntil: report.reported.cruisingProfile?.roomMutedUntil?.toISOString() ?? null,
          }
        : null,
    }));
  }

  private async openReport(reportId: string) {
    const report = await this.repository.findReport(reportId);
    if (!report || report.status !== 'OPEN') throw new NotFoundException('No open report');
    return report;
  }

  /** Nothing wrong: what the report hid goes back up, unless something else still holds it. */
  async dismissReport(actor: AuthUser, reportId: string, now = new Date()): Promise<void> {
    const report = await this.openReport(reportId);
    await this.repository.closeReport(report.id, 'DISMISSED', actor.id, now);
    if (HIDE_AT_ONCE.includes(report.reason)) {
      const spot = report.targetType === 'SPOT' ? report.spot : null;
      if (
        spot?.status === 'HIDDEN' &&
        (await this.repository.countOpenReportsOnSpot(spot.id)) === 0 &&
        (await this.repository.countOpenTakedownsOnSpot(spot.id)) === 0
      ) {
        await this.repository.updateSpot(spot.id, { status: 'LIVE' });
      }
      const review = report.review;
      if (
        report.targetType === 'REVIEW' &&
        review?.status === 'HIDDEN' &&
        (await this.repository.countOpenReportsOnReview(review.id)) === 0
      ) {
        await this.repository.setReviewStatus(review.id, 'LIVE');
      }
    }
    if (report.targetType === 'MEDIA' && report.mediaId) {
      await this.media.restoreIfClear(report.mediaId);
    }
    // Phase 5: a meetup or alert hidden by reports goes back up once none is open.
    if (
      report.meetup?.status === 'HIDDEN' &&
      (await this.repository.countOpenReportsOnMeetup(report.meetup.id)) === 0
    ) {
      await this.repository.setMeetupStatus(report.meetup.id, 'LIVE');
    }
    if (
      report.safetyAlert?.hidden &&
      (await this.repository.countOpenReportsOnSafetyAlert(report.safetyAlert.id)) === 0
    ) {
      await this.repository.setSafetyAlertHidden(report.safetyAlert.id, false);
    }
    // Phase 6: a room message hidden by reports goes back up once none is open.
    if (
      report.roomMessage?.hidden &&
      (await this.rooms.countOpenReportsOnRoomMessage(report.roomMessage.id)) === 0
    ) {
      await this.rooms.setHidden(report.roomMessage.id, false);
    }
    await this.activity.record(actor, {
      action: 'cruising.report_dismissed',
      targetId: report.id,
      targetLabel: report.reason,
    });
  }

  /** Removes what was reported (a spot is rejected, a review deleted) and/or suspends the person. */
  async actOnReport(
    actor: AuthUser,
    reportId: string,
    input: ReportActionInput,
    now = new Date(),
  ): Promise<void> {
    const report = await this.openReport(reportId);
    if (input.suspend && !report.reportedId) {
      throw new BadRequestException('There is nobody to suspend');
    }
    if (input.remove) {
      if (report.targetType === 'SPOT' && report.spot) {
        if (nextSpotStatus(report.spot.status, 'remove')) {
          await this.removeLoaded(
            actor,
            report.spot,
            input.reason || `Report: ${report.reason}`,
            now,
          );
        }
      } else if (report.review) {
        await this.repository.deleteReview(report.review.id);
      } else if (report.targetType === 'MEDIA' && report.mediaId) {
        await this.media.remove(
          actor,
          report.mediaId,
          {
            reason: input.reason || `Report: ${report.reason}`,
            blockHash: true,
            withdrawVerification: false,
          },
          now,
        );
      } else if (report.meetup) {
        await this.repository.deleteMeetup(report.meetup.id);
      } else if (report.safetyAlert) {
        await this.repository.deleteSafetyAlert(report.safetyAlert.id);
      } else if (report.roomMessage) {
        await this.rooms.closeOpenReportsOnRoomMessage(report.roomMessage.id, actor.id, now);
        await this.rooms.deleteMessage(report.roomMessage.id);
      }
    }
    if (input.withdrawVerification && report.reportedId) {
      await this.withdrawIfVerified(actor, report.reportedId);
    }
    if (input.suspend && report.reportedId) {
      // The report's reason is the category (or the moderator's): MINOR, NON_CONSENSUAL and
      // ILLEGAL are shared in the three 18+ apps (decision 114).
      await this.suspend(
        actor,
        report.reportedId,
        {
          duration: input.suspend,
          reason: input.reason || `Report: ${report.reason}`,
          category: input.category ?? report.reason,
        },
        now,
        report.id,
      );
    }
    await this.repository.closeReport(report.id, 'ACTIONED', actor.id, now);
    await this.activity.record(actor, {
      action: 'cruising.report_actioned',
      targetId: report.id,
      targetLabel: report.reason,
      details: {
        remove: input.remove,
        suspend: input.suspend,
        withdrawVerification: input.withdrawVerification,
      },
    });
  }

  /** Takes the badge away when the person has it (nothing to withdraw is fine here). */
  private async withdrawIfVerified(actor: AuthUser, userId: string): Promise<void> {
    if (await this.verification.isVerified(userId)) {
      await this.media.withdrawVerification(actor, userId);
    }
  }

  /** The team removes a photo or video (blocked by hash) and may suspend its owner. */
  async removeMedia(
    actor: AuthUser,
    mediaId: string,
    input: RemoveMediaInput,
    now = new Date(),
  ): Promise<void> {
    const { ownerId } = await this.media.remove(actor, mediaId, input, now);
    if (input.suspend) {
      await this.suspend(
        actor,
        ownerId,
        { duration: input.suspend, reason: input.reason, category: input.category },
        now,
      );
    }
  }

  // ---- Admin: removal requests -------------------------------------------------------------------

  async takedowns(status: 'OPEN' | 'REMOVED' | 'CLOSED') {
    return (await this.repository.takedowns(status)).map((request) => ({
      id: request.id,
      email: request.email,
      spotLink: request.spotLink,
      reason: request.reason,
      details: request.details,
      locale: toAccountLocale(request.locale),
      status: request.status,
      response: request.response,
      createdAt: request.createdAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      reviewedBy: request.reviewedBy,
      spot: request.spot,
      mediaRef: request.mediaRef,
      media: request.media,
    }));
  }

  /** Remove (the spot becomes REMOVED, final) or close (the spot is restored); the person is emailed. */
  async decideTakedown(
    actor: AuthUser,
    takedownId: string,
    input: TakedownDecision,
    now = new Date(),
  ): Promise<void> {
    const request = await this.repository.findTakedown(takedownId);
    if (!request || request.status !== 'OPEN') {
      throw new NotFoundException('No open removal request');
    }
    const spot = request.spot;
    if (request.mediaId) {
      if (input.remove) {
        await this.media.remove(
          actor,
          request.mediaId,
          { reason: 'Removal request', blockHash: true, withdrawVerification: false },
          now,
        );
      } else {
        await this.media.restoreIfClear(request.mediaId, { takedownId: request.id });
      }
    }
    if (input.remove && spot && spot.status !== 'REMOVED') {
      await this.repository.updateSpot(spot.id, {
        status: 'REMOVED',
        rejectReason: 'Removal request',
        reviewedAt: now,
      });
    } else if (
      !input.remove &&
      spot?.status === 'HIDDEN' &&
      (await this.repository.countOpenReportsOnSpot(spot.id)) === 0 &&
      (await this.repository.countOpenTakedownsOnSpot(spot.id, request.id)) === 0
    ) {
      await this.repository.updateSpot(spot.id, { status: 'LIVE' });
    }
    await this.repository.closeTakedown(
      request.id,
      input.remove ? 'REMOVED' : 'CLOSED',
      input.response || null,
      actor.id,
      now,
    );
    await this.activity.record(actor, {
      action: input.remove ? 'cruising.takedown_removed' : 'cruising.takedown_closed',
      targetId: request.id,
      targetLabel: spot?.slug ?? request.mediaRef ?? request.id.slice(0, 8),
    });
    this.sendMail(
      cruisingTakedownEmail(
        request.email,
        toAccountLocale(request.locale),
        input.remove ? 'removed' : 'closed',
        request.id,
        input.response || null,
        this.config.siteUrl,
      ),
    );
  }

  // ---- Admin: suspensions ------------------------------------------------------------------------

  async suspend(
    actor: AuthUser,
    userId: string,
    input: SuspendUserInput,
    now = new Date(),
    reportId: string | null = null,
  ): Promise<void> {
    const profile = await this.repository.findProfile(userId);
    if (!profile) throw new NotFoundException('Not a Cruising member');
    if (isSeriousCategory(input.category)) {
      // Shared in the three 18+ apps with the same end (decision 114): the check-in ends, the
      // verification goes and the email names no app.
      await this.safety.suspend(
        actor,
        userId,
        {
          category: input.category,
          sourceApp: 'CRUISING',
          reason: input.reason || `Category: ${input.category}`,
          duration: input.duration,
          reportId,
        },
        now,
      );
      return;
    }
    const until = suspensionEnd(input.duration, now);
    await this.repository.updateProfile(userId, {
      suspendedAt: now,
      suspendedUntil: until,
      suspensionReason: input.reason || null,
      suspensionCategory: input.category,
    });
    // A suspended member can't be "here": the check-in ends with the suspension.
    await this.repository.endCheckIns(userId, now);
    if (input.withdrawVerification) await this.withdrawIfVerified(actor, userId);
    const user = await this.repository.findUser(userId);
    await this.activity.record(actor, {
      action: 'cruising.suspended',
      targetId: userId,
      targetLabel: user?.email ?? userId,
      details: { duration: input.duration, reason: input.reason ?? null, category: input.category },
    });
    await this.notifyMember(userId, 'suspended', input.reason || null, until);
  }

  /** Lifts Cruising's suspension; a shared one is lifted in the three apps (with a reason). */
  async unsuspend(
    actor: AuthUser,
    userId: string,
    now = new Date(),
    reason = 'Lifted from Cruising moderation',
  ): Promise<void> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || !isSuspended(profile, now)) throw new NotFoundException('Not suspended');
    if (await this.safety.isSharedInProfile(userId, profile.suspendedAt, now)) {
      await this.safety.lift(actor, userId, reason, now);
      return;
    }
    await this.repository.updateProfile(userId, {
      suspendedAt: null,
      suspendedUntil: null,
      suspensionReason: null,
      suspensionCategory: null,
    });
    // A shared suspension still in force shows again.
    await this.safety.reapply(userId, now, ['CRUISING']);
    const user = await this.repository.findUser(userId);
    await this.activity.record(actor, {
      action: 'cruising.unsuspended',
      targetId: userId,
      targetLabel: user?.email ?? userId,
    });
  }

  async suspensions(now = new Date()) {
    const profiles = await this.repository.suspendedProfiles(now);
    const verified = await this.verification.verifiedAmong(profiles.map((row) => row.userId));
    return profiles.map((profile) => ({
      userId: profile.user.id,
      name: profile.user.name,
      email: profile.user.email,
      nickname: profile.nickname,
      verified: verified.has(profile.userId),
      reason: profile.suspensionReason,
      until: profile.suspendedUntil?.toISOString() ?? null,
      suspendedAt: profile.suspendedAt?.toISOString() ?? null,
    }));
  }
}
