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
import { toApiLocale, toDbLocale } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CruisingProfile } from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService } from '../mail/mail.service.js';
import { sharesContact } from '../swipe/swipe-chat-guard.js';
import {
  cruisingAlertEmail,
  cruisingDigestEmail,
  cruisingNoticeEmail,
  cruisingTakedownEmail,
  type CruisingNotice,
} from './cruising-emails.js';
import {
  citySlugOf,
  extractSpotSlug,
  isSuspended,
  memberCanChange,
  nextSpotStatus,
  roundCoordinate,
  spotSlugBase,
  takedownHidesAtOnce,
  uniqueSlug,
  type Bbox,
} from './cruising.rules.js';
import { CruisingRepository } from './cruising.repository.js';
import {
  ageOn,
  CRUISING_MIN_AGE,
  HIDE_AT_ONCE,
  MAX_SPOTS_IN_BOX,
  MAX_SPOTS_IN_CITY,
  REPORTS_PER_DAY,
  REVIEWS_PER_DAY,
  SPOTS_PER_DAY,
  suspensionEnd,
  type OnboardingInput,
  type ProfileInput,
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
/** The team's digest: checked this often, sent at most once in DIGEST_MIN_GAP_MS. */
const DIGEST_EVERY_MS = 30 * 60 * 1000;
const DIGEST_MIN_GAP_MS = 60 * 60 * 1000;

export interface CruisingStatus {
  onboarded: boolean;
  termsVersion: string;
  acceptedTermsVersion: string | null;
  suspended: boolean;
  suspension: { reason: string | null; until: string | null } | null;
  /** Entered, current terms, not suspended. */
  allowed: boolean;
  emailAlerts: boolean;
  /** Phase 2: null until a nickname is set. */
  profile: {
    nickname: string;
    bio: string;
    country: string | null;
    lookingFor: ('CHAT' | 'FRIENDS' | 'DATES' | 'FUN' | 'GROUP')[];
    showAge: boolean;
  } | null;
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

export interface CruisingSpotPublic extends CruisingSpotSummary {
  countryCode: string;
  city: string;
  citySlug: string;
  description: string;
  bestTimes: string | null;
  createdAt: string;
}

export interface CruisingReviewView {
  id: string;
  rating: number;
  text: string | null;
  mine: boolean;
  /** Null: "Member" (phase 1). */
  author: { nickname: string } | null;
  createdAt: string;
  updatedAt: string;
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
  };
}

/** A write refused because the value is taken (Prisma's P2002). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}

@Injectable()
export class CruisingService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CruisingService.name);
  private timers: NodeJS.Timeout[] = [];
  private lastDigestAt = 0;

  constructor(
    private readonly repository: CruisingRepository,
    private readonly activity: ActivityService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timers.push(setInterval(() => void this.sendDigest(), DIGEST_EVERY_MS).unref());
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

  /** The team's digest, when something new is waiting since the last one (at most hourly). */
  async sendDigest(now = new Date()): Promise<boolean> {
    if (!this.config.leadsNotifyTo) return false;
    if (now.getTime() - this.lastDigestAt < DIGEST_MIN_GAP_MS) return false;
    try {
      const newest = await this.repository.newestPendingAt();
      if (!newest || newest.getTime() <= this.lastDigestAt) return false;
      const overview = await this.repository.overview(now);
      this.lastDigestAt = now.getTime();
      this.sendMail(
        cruisingDigestEmail(
          this.config.leadsNotifyTo,
          {
            spots: overview.pendingSpots,
            reports: overview.openReports,
            takedowns: overview.openTakedowns,
          },
          this.config.siteUrl,
        ),
      );
      return true;
    } catch (error) {
      this.logger.error(`Cruising digest failed: ${String(error)}`);
      return false;
    }
  }

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
          toApiLocale(user.locale),
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
    return this.statusOf(await this.repository.findProfile(userId), now);
  }

  private statusOf(profile: CruisingProfile | null, now: Date): CruisingStatus {
    const onboarded = !!profile && profile.termsVersion === this.termsVersion;
    const suspended = isSuspended(profile, now);
    return {
      onboarded,
      termsVersion: this.termsVersion,
      acceptedTermsVersion: profile?.termsVersion ?? null,
      suspended,
      suspension: suspended
        ? {
            reason: profile?.suspensionReason ?? null,
            until: profile?.suspendedUntil?.toISOString() ?? null,
          }
        : null,
      allowed: onboarded && !suspended,
      emailAlerts: profile?.emailAlerts ?? true,
      profile: null,
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
    const birthYear = Number(input.birthDate.slice(0, 4));
    const profile = await this.repository.saveOnboarding(userId, this.termsVersion, birthYear, now);
    return this.statusOf(profile, now);
  }

  async updateProfile(
    userId: string,
    input: ProfileInput,
    now = new Date(),
  ): Promise<CruisingStatus> {
    await this.enteredProfile(userId);
    const profile = await this.repository.updateProfile(
      userId,
      input.emailAlerts === undefined ? {} : { emailAlerts: input.emailAlerts },
    );
    return this.statusOf(profile, now);
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

  private summary(spot: {
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

  /** Up to 500 LIVE spots in the box; `truncated` when there were more. */
  async spotsInBox(
    box: Bbox,
    type?: SpotType,
  ): Promise<{ items: CruisingSpotSummary[]; truncated: boolean }> {
    const spots = await this.repository.spotsInBox(box, type, MAX_SPOTS_IN_BOX + 1);
    return {
      items: spots.slice(0, MAX_SPOTS_IN_BOX).map((spot) => this.summary(spot)),
      truncated: spots.length > MAX_SPOTS_IN_BOX,
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
      createdAt: spot.createdAt.toISOString(),
    };
  }

  /** Countries with their cities, most spots first. */
  async places() {
    const rows = await this.repository.liveCityCounts();
    const countries = new Map<
      string,
      { count: number; cities: Map<string, { names: Map<string, number>; count: number }> }
    >();
    for (const row of rows) {
      const country = countries.get(row.countryCode) ?? { count: 0, cities: new Map() };
      country.count += row.count;
      const city = country.cities.get(row.citySlug) ?? { names: new Map(), count: 0 };
      city.count += row.count;
      city.names.set(row.city, (city.names.get(row.city) ?? 0) + row.count);
      country.cities.set(row.citySlug, city);
      countries.set(row.countryCode, country);
    }
    return {
      countries: [...countries.entries()]
        .map(([countryCode, country]) => ({
          countryCode,
          count: country.count,
          cities: [...country.cities.entries()]
            .map(([citySlug, city]) => ({
              // The spelling most spots use.
              city: [...city.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? citySlug,
              citySlug,
              count: city.count,
            }))
            .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city)),
        }))
        .sort((a, b) => b.count - a.count || a.countryCode.localeCompare(b.countryCode)),
    };
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
    const fields = newSpotFields(input);
    const base = spotSlugBase(input.name);
    for (let attempt = 1; ; attempt += 1) {
      const slug = await uniqueSlug(base, (candidate) => this.repository.slugTaken(candidate));
      try {
        const spot = await this.repository.createSpot({
          ...fields,
          slug,
          status: 'PENDING',
          createdById: userId,
        });
        return { id: spot.id, slug: spot.slug, status: 'PENDING' };
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
      ...spotChanges(patch),
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
  ): CruisingReviewView {
    return {
      id: review.id,
      rating: review.rating,
      text: review.text,
      mine: review.userId === viewerId,
      author: null,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
    };
  }

  /** The reviews of a LIVE spot: only for a member who has entered. */
  async reviews(
    userId: string,
    spotId: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<CruisingReviewView>> {
    await this.enteredProfile(userId);
    await this.liveSpot(spotId);
    const { skip, take } = pageToSkipTake(page, pageSize);
    const { items, total } = await this.repository.reviewsOfSpot(spotId, skip, take);
    return paginate(
      items.map((review) => this.reviewView(review, userId)),
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
    await this.allowedProfile(userId, now);
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
    return this.reviewView(review, userId);
  }

  async deleteReview(userId: string, spotId: string): Promise<void> {
    const review = await this.repository.findReview(spotId, userId);
    if (!review) throw new NotFoundException('Review not found');
    await this.repository.deleteReview(review.id);
  }

  // ---- Reports and removal requests --------------------------------------------------------------

  /** A member reports a spot or a review. MINOR and ILLEGAL hide it at once. */
  async report(userId: string, input: ReportInput, now = new Date()): Promise<void> {
    await this.allowedProfile(userId, now);
    if (input.reason === 'WRONG_INFO' && !input.spotId) {
      throw new BadRequestException('Wrong information can only be reported on a spot');
    }
    const today = await this.repository.countReportsSince(userId, new Date(now.getTime() - DAY_MS));
    if (today >= REPORTS_PER_DAY) {
      throw new HttpException('Too many reports today', HttpStatus.TOO_MANY_REQUESTS);
    }
    const hide = HIDE_AT_ONCE.includes(input.reason);
    let reportId: string;
    if (input.spotId) {
      const spot = await this.liveSpot(input.spotId);
      const report = await this.repository.createReport({
        reporterId: userId,
        targetType: 'SPOT',
        spotId: spot.id,
        reportedId: spot.createdById,
        reason: input.reason,
        details: input.details || null,
        createdAt: now,
      });
      reportId = report.id;
      if (hide) await this.repository.updateSpot(spot.id, { status: 'HIDDEN' });
    } else {
      const review = await this.repository.findReviewById(input.reviewId as string);
      if (
        !review ||
        review.userId === userId ||
        review.status !== 'LIVE' ||
        review.spot.status !== 'LIVE'
      ) {
        throw new NotFoundException('Review not found');
      }
      const report = await this.repository.createReport({
        reporterId: userId,
        targetType: 'REVIEW',
        reviewId: review.id,
        reportedId: review.userId,
        reason: input.reason,
        details: input.details || null,
        createdAt: now,
      });
      reportId = report.id;
      if (hide) await this.repository.setReviewStatus(review.id, 'HIDDEN');
    }
    if (input.reason === 'MINOR') this.alert('minor-report', reportId);
  }

  /** A removal request from anyone. The LIVE spot its link names is hidden at once. */
  async takedown(input: TakedownInput, now = new Date()): Promise<{ id: string }> {
    // The honeypot: pretend it worked.
    if (input.website) return { id: '00000000-0000-0000-0000-000000000000' };
    const slug = input.spotLink ? extractSpotSlug(input.spotLink) : null;
    const spot = slug ? await this.repository.findSpotBySlug(slug) : null;
    const request = await this.repository.createTakedown({
      email: input.email,
      spotLink: input.spotLink || null,
      spotId: spot?.id ?? null,
      reason: input.reason,
      details: input.details,
      locale: toDbLocale(input.locale),
      createdAt: now,
    });
    // Only a minor or something illegal hides the spot at once; anything else waits for the team.
    if (spot?.status === 'LIVE' && takedownHidesAtOnce(input.reason)) {
      await this.repository.updateSpot(spot.id, { status: 'HIDDEN' });
    }
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

  /** The team corrects a spot's fields. The slug stays. */
  async correctSpot(actor: AuthUser, spotId: string, patch: SpotPatch): Promise<void> {
    const spot = await this.anySpot(spotId);
    await this.repository.updateSpot(spot.id, spotChanges(patch));
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
    if (spot.createdById) await this.notifyMember(spot.createdById, 'spot-rejected', reason);
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
    if (spot.createdById) await this.notifyMember(spot.createdById, 'spot-removed', reason);
  }

  // ---- Admin: reports ----------------------------------------------------------------------------

  async reports(status: 'OPEN' | 'DISMISSED' | 'ACTIONED') {
    const reports = await this.repository.reports(status);
    const counts = await this.repository.reportCounts([
      ...new Set(reports.flatMap((report) => (report.reportedId ? [report.reportedId] : []))),
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
            : null,
      reporter: {
        userId: report.reporter.id,
        name: report.reporter.name,
        email: report.reporter.email,
      },
      reported: report.reported
        ? {
            userId: report.reported.id,
            name: report.reported.name,
            email: report.reported.email,
            nickname: null,
            suspended: isSuspended(report.reported.cruisingProfile),
            reports: counts.get(report.reported.id) ?? 0,
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
      }
    }
    if (input.suspend && report.reportedId) {
      await this.suspend(
        actor,
        report.reportedId,
        { duration: input.suspend, reason: input.reason || `Report: ${report.reason}` },
        now,
      );
    }
    await this.repository.closeReport(report.id, 'ACTIONED', actor.id, now);
    await this.activity.record(actor, {
      action: 'cruising.report_actioned',
      targetId: report.id,
      targetLabel: report.reason,
      details: { remove: input.remove, suspend: input.suspend },
    });
  }

  // ---- Admin: removal requests -------------------------------------------------------------------

  async takedowns(status: 'OPEN' | 'REMOVED' | 'CLOSED') {
    return (await this.repository.takedowns(status)).map((request) => ({
      id: request.id,
      email: request.email,
      spotLink: request.spotLink,
      reason: request.reason,
      details: request.details,
      locale: toApiLocale(request.locale),
      status: request.status,
      response: request.response,
      createdAt: request.createdAt.toISOString(),
      reviewedAt: request.reviewedAt?.toISOString() ?? null,
      reviewedBy: request.reviewedBy,
      spot: request.spot,
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
      targetLabel: spot?.slug ?? request.id.slice(0, 8),
    });
    this.sendMail(
      cruisingTakedownEmail(
        request.email,
        toApiLocale(request.locale),
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
  ): Promise<void> {
    const profile = await this.repository.findProfile(userId);
    if (!profile) throw new NotFoundException('Not a Cruising member');
    const until = suspensionEnd(input.duration, now);
    await this.repository.updateProfile(userId, {
      suspendedAt: now,
      suspendedUntil: until,
      suspensionReason: input.reason || null,
    });
    const user = await this.repository.findUser(userId);
    await this.activity.record(actor, {
      action: 'cruising.suspended',
      targetId: userId,
      targetLabel: user?.email ?? userId,
      details: { duration: input.duration, reason: input.reason ?? null },
    });
    await this.notifyMember(userId, 'suspended', input.reason || null, until);
  }

  async unsuspend(actor: AuthUser, userId: string, now = new Date()): Promise<void> {
    const profile = await this.repository.findProfile(userId);
    if (!profile || !isSuspended(profile, now)) throw new NotFoundException('Not suspended');
    await this.repository.updateProfile(userId, {
      suspendedAt: null,
      suspendedUntil: null,
      suspensionReason: null,
    });
    const user = await this.repository.findUser(userId);
    await this.activity.record(actor, {
      action: 'cruising.unsuspended',
      targetId: userId,
      targetLabel: user?.email ?? userId,
    });
  }

  async suspensions(now = new Date()) {
    return (await this.repository.suspendedProfiles(now)).map((profile) => ({
      userId: profile.user.id,
      name: profile.user.name,
      email: profile.user.email,
      nickname: null,
      reason: profile.suspensionReason,
      until: profile.suspendedUntil?.toISOString() ?? null,
      suspendedAt: profile.suspendedAt?.toISOString() ?? null,
    }));
  }
}
