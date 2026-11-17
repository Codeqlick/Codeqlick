import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import {
  siteLocale,
  toAccountLocale,
  type AccountLocale,
} from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CruisingProfile, Locale } from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { maskEmail } from '../auth/unsubscribe-token.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { sharesContact } from '../swipe/swipe-chat-guard.js';
import { CruisingPushService } from './cruising-push.service.js';
import {
  contactAlertEmail,
  contactInviteEmail,
  memberSafetyEmail,
  safetyPushPayload,
} from './cruising-safety-emails.js';
import { CruisingSafetyRepository } from './cruising-safety.repository.js';
import {
  extendedEnd,
  formatAlertTime,
  hashToken,
  healthReminderNeeded,
  isValidTestMonth,
  makeStopToken,
  MAX_TRUSTED_CONTACTS,
  newToken,
  osmLink,
  TIMER_KEEP_MS,
  TIMER_WARN_MS,
  timerAction,
  timerEnd,
  verifyStopToken,
} from './cruising-safety.rules.js';
import type {
  ContactResponseInput,
  ExtendTimerInput,
  HealthCenterInput,
  HealthCenterPatch,
  HealthCentersQuery,
  HealthInput,
  ImportHealthCentersInput,
  TimerInput,
  TrustedContactInput,
} from './cruising-safety.schemas.js';
import { healthCenterSchema } from './cruising-safety.schemas.js';
import {
  boxAround,
  citySlugOf,
  findDuplicate,
  groupPlaces,
  isSuspended,
  parseHealthCentersCsv,
  parseHealthCentersGeojson,
  roundCoordinate,
  type PlaceCountry,
} from './cruising.rules.js';
import { CruisingRepository } from './cruising.repository.js';
import { IMPORT_MAX_ROWS } from './cruising.schemas.js';
import { issueReason } from './cruising.service.js';

/** The timers are checked this often… */
const TIMER_EVERY_MS = 60 * 1000;
/** …up to this many a run (the rest wait a minute). */
const TIMER_BATCH = 500;
/** Cleanup and the check-up reminders run hourly. */
const HOURLY_MS = 60 * 60 * 1000;
const REMINDER_PAGE = 500;
/** Centres the map returns for one box, and a list at most. */
const MAX_CENTERS_IN_BOX = 500;
const MAX_CENTERS_LISTED = 1000;
/** Two centres this close are the same place (import). */
const CENTER_DUPLICATE_METERS = 50;

export interface TrustedContactView {
  id: string;
  /** Masked: `l***@example.com`. */
  email: string;
  displayName: string;
  status: 'PENDING' | 'ACCEPTED' | 'REFUSED';
  createdAt: string;
}

export interface TimerView {
  id: string;
  endsAt: string;
  startedAt: string;
  message: string | null;
  shareSpot: boolean;
  spot: { id: string; slug: string; name: string } | null;
  /** The 10-minute reminder went out. */
  warned: boolean;
}

export interface HealthView {
  enabled: boolean;
  prepStatus: 'ON_PREP' | 'NOT_ON_PREP' | null;
  lastTestedMonth: string | null;
  visible: boolean;
  reminderMonths: number | null;
}

export interface HealthCenterView {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  countryCode: string;
  city: string;
  citySlug: string;
  url: string | null;
  phone: string | null;
  free: boolean;
  anonymous: boolean;
  rapid: boolean;
}

export interface HealthImportResult {
  created: number;
  skipped: { row: number; reason: string }[];
  items: { row: number; name: string; city: string; countryCode: string }[];
}

function centerView(row: {
  id: string;
  name: string;
  address: string;
  lat: unknown;
  lng: unknown;
  countryCode: string;
  city: string;
  citySlug: string;
  url: string | null;
  phone: string | null;
  free: boolean;
  anonymous: boolean;
  rapid: boolean;
}): HealthCenterView {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    lat: Number(row.lat),
    lng: Number(row.lng),
    countryCode: row.countryCode,
    city: row.city,
    citySlug: row.citySlug,
    url: row.url,
    phone: row.phone,
    free: row.free,
    anonymous: row.anonymous,
    rapid: row.rapid,
  };
}

function centerFields(input: HealthCenterInput) {
  return {
    name: input.name,
    address: input.address,
    lat: roundCoordinate(input.lat),
    lng: roundCoordinate(input.lng),
    countryCode: input.countryCode,
    city: input.city,
    citySlug: citySlugOf(input.city),
    url: input.url,
    phone: input.phone,
    free: input.free,
    anonymous: input.anonymous,
    rapid: input.rapid,
  };
}

/**
 * Cruising's safety and health (architecture 4.15, phase 5): trusted contacts and the "Check on me"
 * timer (decision 95), sexual health and the testing centres (decision 94).
 */
@Injectable()
export class CruisingSafetyService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CruisingSafetyService.name);
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly repository: CruisingSafetyRepository,
    private readonly cruising: CruisingRepository,
    private readonly push: CruisingPushService,
    private readonly mail: MailService,
    private readonly activity: ActivityService,
    private readonly config: AppConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timers.push(
      setInterval(() => void this.checkTimers(), TIMER_EVERY_MS).unref(),
      setInterval(() => void this.hourly(), HOURLY_MS).unref(),
    );
  }

  onApplicationShutdown(): void {
    for (const timer of this.timers) clearInterval(timer);
  }

  private async sendMail(message: MailMessage): Promise<boolean> {
    try {
      await this.mail.send(message);
      return true;
    } catch (error) {
      this.logger.error(`Cruising safety email not sent: ${String(error)}`);
      return false;
    }
  }

  /** The website's page where a contact answers or stops (no session: the token is the proof). */
  private contactPage(locale: AccountLocale, token: string): string {
    return `${this.config.siteUrlFor('NEOQLICK')}/${siteLocale(locale)}/safety-contact?token=${encodeURIComponent(token)}`;
  }

  private stopUrl(contact: { id: string; locale: Locale }): string {
    return this.contactPage(
      toAccountLocale(contact.locale),
      makeStopToken(contact.id, this.config.jwtAccessSecret),
    );
  }

  // ---- Who may do what ---------------------------------------------------------------------------

  /** A member who entered with the current rules. */
  private async entered(userId: string): Promise<CruisingProfile> {
    const profile = await this.cruising.findProfile(userId);
    if (!profile || profile.termsVersion !== this.config.cruisingTermsVersion) {
      throw new ForbiddenException('Confirm your age and accept the rules first');
    }
    return profile;
  }

  /** …and isn't suspended (inviting someone sends an email). */
  private async allowed(userId: string, now: Date): Promise<CruisingProfile> {
    const profile = await this.entered(userId);
    if (isSuspended(profile, now)) throw new ForbiddenException('Your account is suspended');
    return profile;
  }

  // ---- Trusted contacts (decision 95) ------------------------------------------------------------

  async contacts(userId: string): Promise<{ items: TrustedContactView[] }> {
    await this.entered(userId);
    const rows = await this.repository.contacts(userId);
    return {
      items: rows.map((row) => ({
        id: row.id,
        email: maskEmail(row.email),
        displayName: row.displayName,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /** Names a trusted contact (up to 2) and emails the invitation in the member's language. */
  async addContact(
    user: AuthUser,
    input: TrustedContactInput,
    now = new Date(),
  ): Promise<TrustedContactView> {
    await this.allowed(user.id, now);
    const account = await this.cruising.recipient(user.id);
    if (!account) throw new ForbiddenException('Sign in again');
    if (input.email === account.email.toLowerCase()) {
      throw new BadRequestException("A trusted contact can't be yourself");
    }
    if ((await this.repository.countContacts(user.id)) >= MAX_TRUSTED_CONTACTS) {
      throw new ConflictException(`You can name up to ${MAX_TRUSTED_CONTACTS} trusted contacts`);
    }
    if (await this.repository.hasContact(user.id, input.email)) {
      throw new ConflictException('This person is one of your contacts already');
    }
    const token = newToken();
    const contact = await this.repository.createContact({
      userId: user.id,
      email: input.email,
      displayName: input.displayName,
      locale: account.locale,
      inviteTokenHash: hashToken(token),
      createdAt: now,
    });
    const locale = toAccountLocale(account.locale);
    await this.sendMail(
      contactInviteEmail(
        contact.email,
        locale,
        contact.displayName,
        this.contactPage(locale, token),
        this.stopUrl(contact),
        this.config.siteUrlFor('NEOQLICK'),
      ),
    );
    return {
      id: contact.id,
      email: maskEmail(contact.email),
      displayName: contact.displayName,
      status: contact.status,
      createdAt: contact.createdAt.toISOString(),
    };
  }

  /**
   * Removes a pending or accepted contact. One who refused or stopped stays listed (it doesn't count
   * toward the 2) so that they are never asked again.
   */
  async deleteContact(userId: string, contactId: string): Promise<void> {
    await this.entered(userId);
    const contact = await this.repository.findContact(contactId);
    if (!contact || contact.userId !== userId) throw new NotFoundException('Contact not found');
    if (contact.status === 'REFUSED') {
      throw new ConflictException("Someone who refused stays listed so they're never asked again");
    }
    await this.repository.deleteContact(contactId, userId);
  }

  /**
   * A contact's answer from the website: the invitation's single-use token accepts or refuses; a
   * stop token (from any email) refuses for good. Unknown, spent or forged tokens are a 404.
   */
  async respond(input: ContactResponseInput, now = new Date()): Promise<void> {
    const stopId = verifyStopToken(input.token, this.config.jwtAccessSecret);
    if (stopId) {
      if (input.accept) throw new BadRequestException('A stop link can only stop the alerts');
      const contact = await this.repository.findContact(stopId);
      if (!contact) throw new NotFoundException('This link is no longer valid');
      await this.repository.stopContact(contact.id, now);
      return;
    }
    if (input.token.startsWith('stop.')) throw new NotFoundException('This link is not valid');
    const hash = hashToken(input.token);
    const contact = await this.repository.findContactByInvite(hash);
    if (
      !contact ||
      !(await this.repository.answerInvite(
        contact.id,
        hash,
        input.accept ? 'ACCEPTED' : 'REFUSED',
        now,
      ))
    ) {
      throw new NotFoundException('This link is no longer valid');
    }
  }

  // ---- The "Check on me" timer (decision 95) -----------------------------------------------------

  private timerView(timer: {
    id: string;
    endsAt: Date;
    createdAt: Date;
    message: string | null;
    warnedAt: Date | null;
    spot: { id: string; slug: string; name: string } | null;
  }): TimerView {
    return {
      id: timer.id,
      endsAt: timer.endsAt.toISOString(),
      startedAt: timer.createdAt.toISOString(),
      message: timer.message,
      shareSpot: timer.spot !== null,
      spot: timer.spot ? { id: timer.spot.id, slug: timer.spot.slug, name: timer.spot.name } : null,
      warned: timer.warnedAt !== null,
    };
  }

  /** My running timer, or null. */
  async timer(userId: string): Promise<TimerView | null> {
    await this.entered(userId);
    const timer = await this.repository.activeTimer(userId);
    return timer ? this.timerView(timer) : null;
  }

  /**
   * Starts my timer (ending a running one): it needs a contact who accepted, its message passes
   * the contact filter, and a shared spot must be LIVE.
   */
  async startTimer(userId: string, input: TimerInput, now = new Date()): Promise<TimerView> {
    await this.entered(userId);
    if (input.message && sharesContact(input.message)) {
      throw new BadRequestException(
        "The message can't hold phone numbers, emails, links or other apps",
      );
    }
    if ((await this.repository.acceptedContacts(userId)).length === 0) {
      throw new ConflictException('A trusted contact has to accept your invitation first');
    }
    let spotId: string | null = null;
    if (input.shareSpot && input.spotId) {
      const spot = await this.cruising.findSpot(input.spotId);
      if (!spot || spot.status !== 'LIVE') throw new NotFoundException('Spot not found');
      spotId = spot.id;
    }
    const timer = await this.repository.startTimer(
      { userId, endsAt: timerEnd(input.minutes, now), message: input.message, spotId },
      now,
    );
    return this.timerView(timer);
  }

  /** Adds time to my running timer, up to 6 hours from now. */
  async extendTimer(userId: string, input: ExtendTimerInput, now = new Date()): Promise<TimerView> {
    await this.entered(userId);
    const timer = await this.repository.activeTimer(userId);
    if (!timer) throw new NotFoundException('No timer running');
    const end = extendedEnd(timer.endsAt, input.minutes, now);
    if (!end) throw new BadRequestException('A timer can run up to 6 hours from now');
    const extended = await this.repository.extendTimer(timer.id, end);
    if (!extended) throw new NotFoundException('No timer running');
    return this.timerView(extended);
  }

  /** Ends my timer: I'm fine (nothing running is fine too). */
  async endTimer(userId: string, now = new Date()): Promise<void> {
    await this.entered(userId);
    await this.repository.endTimers(userId, now);
  }

  /**
   * The background check (every minute): reminds members 10 minutes before their timer ends and,
   * once one runs out unended, emails the contacts who accepted. Each happens once per timer, even
   * across restarts or two runs at once (`warnedAt` and `firedAt` are claimed first).
   */
  async checkTimers(now = new Date()): Promise<{ warned: number; fired: number }> {
    let warned = 0;
    let fired = 0;
    try {
      const due = await this.repository.timersEndingBefore(
        new Date(now.getTime() + TIMER_WARN_MS),
        TIMER_BATCH,
      );
      for (const timer of due) {
        const action = timerAction(timer, now);
        if (action === 'warn' && (await this.repository.claimWarning(timer.id, now))) {
          await this.warn(timer.userId, timer.user.email, toAccountLocale(timer.user.locale));
          warned += 1;
        } else if (action === 'fire' && (await this.repository.claimFiring(timer.id, now))) {
          await this.fire(timer);
          fired += 1;
        }
      }
    } catch (error) {
      this.logger.error(`Cruising timer check failed: ${String(error)}`);
    }
    return { warned, fired };
  }

  /** The member's reminder: on their devices, or by email without one. */
  private async warn(userId: string, email: string, locale: AccountLocale): Promise<void> {
    if (await this.push.hasDevice(userId)) {
      const sent = await this.push.notifyWith(
        (each) => safetyPushPayload('timer', each),
        [{ userId, locale }],
        { ttl: 10 * 60, urgency: 'high' },
      );
      if (sent > 0) return;
    }
    await this.sendMail(
      memberSafetyEmail(
        email,
        locale,
        'timer',
        this.config.webappUrl('cruising'),
        this.config.siteUrlFor('NEOQLICK'),
      ),
    );
  }

  /** Emails every contact who accepted: only what the member chose to share. */
  private async fire(timer: {
    userId: string;
    endsAt: Date;
    message: string | null;
    spot: { name: string; lat: unknown; lng: unknown } | null;
  }): Promise<void> {
    const contacts = await this.repository.acceptedContacts(timer.userId);
    for (const contact of contacts) {
      const locale = toAccountLocale(contact.locale);
      await this.sendMail(
        contactAlertEmail(
          contact.email,
          locale,
          {
            displayName: contact.displayName,
            message: timer.message,
            time: formatAlertTime(timer.endsAt, locale),
            spot: timer.spot
              ? {
                  name: timer.spot.name,
                  mapUrl: osmLink(Number(timer.spot.lat), Number(timer.spot.lng)),
                }
              : null,
          },
          this.stopUrl(contact),
          this.config.siteUrlFor('NEOQLICK'),
        ),
      );
    }
  }

  /** Hourly: old timers go, and the check-up reminders that are due go out. */
  async hourly(now = new Date()): Promise<void> {
    try {
      await this.repository.deleteTimersEndedBefore(new Date(now.getTime() - TIMER_KEEP_MS));
    } catch (error) {
      this.logger.error(`Cruising timer cleanup failed: ${String(error)}`);
    }
    await this.sendHealthReminders(now);
  }

  // ---- Sexual health (decision 94) ---------------------------------------------------------------

  private healthView(profile: CruisingProfile): HealthView {
    return {
      enabled: profile.healthConsentAt !== null,
      prepStatus: profile.prepStatus,
      lastTestedMonth: profile.lastTestedMonth,
      visible: profile.healthVisible,
      reminderMonths: profile.reminderMonths,
    };
  }

  async health(userId: string): Promise<HealthView> {
    return this.healthView(await this.entered(userId));
  }

  /**
   * Turns sexual health on (with its own explicit consent) and saves its fields, or turns it off,
   * which deletes them.
   */
  async saveHealth(userId: string, input: HealthInput, now = new Date()): Promise<HealthView> {
    const profile = await this.entered(userId);
    if (!input.enabled) {
      await this.repository.clearHealth(userId);
      return {
        enabled: false,
        prepStatus: null,
        lastTestedMonth: null,
        visible: false,
        reminderMonths: null,
      };
    }
    if (!profile.healthConsentAt && input.consent !== true) {
      throw new BadRequestException('Give your explicit consent to keep health information');
    }
    if (input.lastTestedMonth && !isValidTestMonth(input.lastTestedMonth, now)) {
      throw new BadRequestException('The last test month must be a past or the current month');
    }
    const saved = await this.repository.saveHealth(userId, {
      healthConsentAt: profile.healthConsentAt ?? now,
      prepStatus: input.prepStatus,
      lastTestedMonth: input.lastTestedMonth,
      healthVisible: input.visible,
      reminderMonths: input.lastTestedMonth ? input.reminderMonths : null,
    });
    return this.healthView(saved);
  }

  /**
   * "Time for your check-up", once per due date: by push on a device, else by email (unless the
   * member turned Cruising's emails off). Suspended members and old terms are skipped.
   */
  async sendHealthReminders(now = new Date()): Promise<number> {
    let sent = 0;
    try {
      for (let cursor: string | undefined; ;) {
        const page = await this.repository.healthReminderCandidates(cursor, REMINDER_PAGE);
        for (const profile of page) {
          if (!healthReminderNeeded(profile, now)) continue;
          if (profile.termsVersion !== this.config.cruisingTermsVersion) continue;
          if (isSuspended(profile, now)) continue;
          await this.repository.markHealthReminded(profile.userId, now);
          const locale = toAccountLocale(profile.user.locale);
          const pushed = (await this.push.hasDevice(profile.userId))
            ? await this.push.notifyWith(
                (each) => safetyPushPayload('health', each),
                [{ userId: profile.userId, locale }],
                { ttl: 24 * 60 * 60 },
              )
            : 0;
          if (pushed === 0 && profile.emailAlerts) {
            await this.sendMail(
              memberSafetyEmail(
                profile.user.email,
                locale,
                'health',
                this.config.webappUrl('cruising'),
                this.config.siteUrlFor('NEOQLICK'),
              ),
            );
          }
          sent += 1;
        }
        if (page.length < REMINDER_PAGE) break;
        cursor = page.at(-1)?.userId;
      }
    } catch (error) {
      this.logger.error(`Cruising health reminders failed: ${String(error)}`);
    }
    return sent;
  }

  // ---- Testing centres (decision 94) -------------------------------------------------------------

  /** Public: the centres of a box of the map, of a country or city, or all of them. */
  async centers(query: HealthCentersQuery): Promise<{ items: HealthCenterView[] }> {
    const rows = query.bbox
      ? await this.repository.centersInBox(query.bbox, MAX_CENTERS_IN_BOX)
      : await this.repository.centersIn(
          {
            ...(query.countryCode ? { countryCode: query.countryCode } : {}),
            ...(query.citySlug ? { citySlug: query.citySlug } : {}),
          },
          MAX_CENTERS_LISTED,
        );
    return { items: rows.map(centerView) };
  }

  /** Public: countries and cities with centres, most first. */
  async centerPlaces(): Promise<{ countries: PlaceCountry[] }> {
    return { countries: groupPlaces(await this.repository.centerCityCounts()) };
  }

  async adminCenters(q?: string): Promise<{ items: HealthCenterView[] }> {
    return { items: (await this.repository.adminCenters(q, MAX_CENTERS_LISTED)).map(centerView) };
  }

  async createCenter(actor: AuthUser, input: HealthCenterInput): Promise<{ id: string }> {
    const created = await this.repository.createCenter(centerFields(input));
    await this.activity.record(actor, {
      action: 'cruising.health_center_created',
      targetId: created.id,
      targetLabel: input.name,
    });
    return created;
  }

  async updateCenter(actor: AuthUser, id: string, patch: HealthCenterPatch): Promise<void> {
    const center = await this.repository.findCenter(id);
    if (!center) throw new NotFoundException('Centre not found');
    await this.repository.updateCenter(id, {
      ...patch,
      ...(patch.lat !== undefined ? { lat: roundCoordinate(patch.lat) } : {}),
      ...(patch.lng !== undefined ? { lng: roundCoordinate(patch.lng) } : {}),
      ...(patch.city !== undefined ? { citySlug: citySlugOf(patch.city) } : {}),
    });
    await this.activity.record(actor, {
      action: 'cruising.health_center_updated',
      targetId: id,
      targetLabel: patch.name ?? center.name,
    });
  }

  async deleteCenter(actor: AuthUser, id: string): Promise<void> {
    const center = await this.repository.findCenter(id);
    if (!center || !(await this.repository.deleteCenter(id))) {
      throw new NotFoundException('Centre not found');
    }
    await this.activity.record(actor, {
      action: 'cruising.health_center_deleted',
      targetId: id,
      targetLabel: center.name,
    });
  }

  /**
   * Imports centres from a CSV or GeoJSON file, like the spots (decision 84): each row checked like
   * the one-centre form and skipped, with its reason, when invalid or within 50 m of a centre or an
   * earlier row. A dry run creates nothing.
   */
  async importCenters(
    actor: AuthUser,
    input: ImportHealthCentersInput,
  ): Promise<HealthImportResult> {
    const parsed =
      input.format === 'csv'
        ? parseHealthCentersCsv(input.content)
        : parseHealthCentersGeojson(input.content);
    if (!parsed.ok) throw new BadRequestException(parsed.error);
    if (parsed.rows.length === 0) throw new BadRequestException('The file has no rows');
    if (parsed.rows.length > IMPORT_MAX_ROWS) {
      throw new BadRequestException(`A file can hold up to ${IMPORT_MAX_ROWS} rows`);
    }
    const skipped: HealthImportResult['skipped'] = [];
    const accepted: { row: number; fields: ReturnType<typeof centerFields> }[] = [];
    for (const { row, fields, error } of parsed.rows) {
      if (!fields) {
        skipped.push({ row, reason: error ?? 'Unreadable row' });
        continue;
      }
      const checked = healthCenterSchema.safeParse(fields);
      if (!checked.success) {
        skipped.push({ row, reason: issueReason(checked.error.issues[0]) });
        continue;
      }
      const center = centerFields(checked.data);
      const point = { lat: center.lat, lng: center.lng, type: 'CENTER' };
      const earlier = findDuplicate(
        point,
        accepted.map((each) => ({ ...each.fields, type: 'CENTER', row: each.row })),
        CENTER_DUPLICATE_METERS,
      );
      if (earlier) {
        skipped.push({ row, reason: `Duplicate of row ${earlier.row} (within 50 m)` });
        continue;
      }
      const existing = findDuplicate(
        point,
        (await this.repository.centersNear(boxAround(point, CENTER_DUPLICATE_METERS))).map(
          (each) => ({ ...each, type: 'CENTER' }),
        ),
        CENTER_DUPLICATE_METERS,
      );
      if (existing) {
        skipped.push({ row, reason: `Duplicate of "${existing.name}" (within 50 m)` });
        continue;
      }
      accepted.push({ row, fields: center });
    }
    const items = accepted.map(({ row, fields }) => ({
      row,
      name: fields.name,
      city: fields.city,
      countryCode: fields.countryCode,
    }));
    if (input.dryRun || accepted.length === 0) return { created: 0, skipped, items };
    const created = await this.repository.createCenters(accepted.map(({ fields }) => fields));
    await this.activity.record(actor, {
      action: 'cruising.health_centers_imported',
      targetLabel: `${created} testing centres`,
      details: { created, skipped: skipped.length, format: input.format },
    });
    return { created, skipped, items };
  }
}
