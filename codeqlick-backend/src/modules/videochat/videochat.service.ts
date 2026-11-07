import { createHash, createHmac, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Subject } from 'rxjs';
import type { VideochatProfile } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { ActivityService, type ActivityActor } from '../activity/activity.service.js';
import { MailService } from '../mail/mail.service.js';
import { WindowLimiter, type MatchPrefs } from './matchmaker.js';
import { appealResolvedEmail, minorReportEmail } from './videochat-emails.js';
import { VideochatRepository } from './videochat.repository.js';
import {
  ageOn,
  suspensionEnd,
  VIDEOCHAT_MIN_AGE,
  VIDEOCHAT_TERMS_VERSION,
  type OnboardingInput,
  type PublicProfile,
  INTERESTS,
  type Interest,
  type ReportReason,
  type SuspensionDuration,
  type VideochatSettings,
} from './videochat.schemas.js';

/** A ticket opens one WebSocket, once, within this time. */
export const TICKET_TTL_MS = 30_000;
/** TURN credentials last this long (a long call keeps working). */
const TURN_TTL_SECONDS = 12 * 60 * 60;
/** Reports from this many different people within a day suspend the account until reviewed. */
export const AUTO_SUSPEND_REPORTERS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Automatic actions in the activity log. */
const SYSTEM: ActivityActor = { id: null, name: 'Codeqlick' };

/** Suspended right now: a timed suspension that ended no longer counts. */
export function isSuspended(
  profile: Pick<VideochatProfile, 'suspendedAt' | 'suspendedUntil'> | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!profile?.suspendedAt) return false;
  return !profile.suspendedUntil || profile.suspendedUntil > now;
}

function settingsOf(profile: VideochatProfile): VideochatSettings {
  return {
    nickname: profile.nickname,
    gender: profile.gender,
    seeking: profile.seeking,
    country: profile.country,
    language: profile.language,
    sameCountryOnly: profile.sameCountryOnly,
    sameLanguageOnly: profile.sameLanguageOnly,
    interests: knownInterests(profile.interests),
  };
}

/** Stored interests still on the list (one removed from it later is dropped). */
function knownInterests(stored: string[] | undefined): Interest[] {
  return (stored ?? []).filter((value): value is Interest =>
    (INTERESTS as readonly string[]).includes(value),
  );
}

export interface VideochatStatus {
  /** 18+ confirmed and the current terms accepted. */
  onboarded: boolean;
  termsVersion: string;
  acceptedTermsVersion: string | null;
  suspended: boolean;
  /** While suspended: why, until when (null: until lifted) and the appeal, if any. */
  suspension: {
    reason: string | null;
    until: string | null;
    appeal: {
      status: 'OPEN' | 'ACCEPTED' | 'REJECTED';
      response: string | null;
      createdAt: string;
    } | null;
  } | null;
  /** The platform asks for a verified age, not only a declared one. */
  ageVerificationRequired: boolean;
  /** This person's age was verified for real. */
  ageVerified: boolean;
  /** May use the video chat now: onboarded, not suspended, age verified when required. */
  allowed: boolean;
  /** Public profile and filters; null before onboarding. */
  profile: VideochatSettings | null;
  /** VAPID key for Web Push subscriptions; null while notifications are off. */
  pushPublicKey: string | null;
}

/** A mutual contact, as their contacts see them. */
export interface VideochatContact extends PublicProfile {
  contactId: string;
  /** In the video chat now… */
  online: boolean;
  /** …and in a call. */
  busy: boolean;
  since: string;
}

/** What the gateway needs about a person when their socket signs in. */
export interface Connection {
  allowed: boolean;
  prefs: MatchPrefs | undefined;
  publicProfile: PublicProfile;
}

export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface VideochatTicket {
  ticket: string;
  expiresIn: number;
  iceServers: IceServer[];
}

export interface TranscriptLine {
  from: 'reporter' | 'reported';
  text: string;
  at: string;
}

export interface ReportView {
  id: string;
  reason: ReportReason;
  details: string | null;
  transcript: TranscriptLine[];
  status: 'OPEN' | 'DISMISSED' | 'ACTIONED';
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: { id: string; name: string } | null;
  reporter: { id: string; name: string; email: string };
  reported: {
    id: string;
    name: string;
    email: string;
    /** Set while suspended now. */
    suspendedAt: string | null;
    /** Reports against them in the last 30 days. */
    recentReports: number;
  };
}

export interface SuspensionView {
  user: { id: string; name: string; email: string };
  suspendedAt: string;
  until: string | null;
  reason: string | null;
}

export interface AppealView {
  id: string;
  message: string;
  status: 'OPEN' | 'ACCEPTED' | 'REJECTED';
  response: string | null;
  createdAt: string;
  reviewedAt: string | null;
  user: { id: string; name: string; email: string };
  sanction: { reason: string | null; until: string | null; createdAt: string };
}

type Person = { id: string; name: string; email: string };

export interface UserDetailView {
  user: Person & { createdAt: string };
  profile: VideochatSettings;
  suspension: { since: string; until: string | null; reason: string | null } | null;
  ageVerified: boolean;
  onboardedAt: string;
  reportsReceived: Array<{
    id: string;
    reason: ReportReason;
    status: string;
    details: string | null;
    createdAt: string;
    reporter: Person;
  }>;
  reportsMade: Array<{
    id: string;
    reason: ReportReason;
    status: string;
    details: string | null;
    createdAt: string;
    reported: Person;
  }>;
  sanctions: Array<{
    id: string;
    kind: 'SUSPENDED' | 'LIFTED';
    reason: string | null;
    until: string | null;
    createdAt: string;
    by: Person | null;
  }>;
  appeals: Array<{
    id: string;
    message: string;
    status: 'OPEN' | 'ACCEPTED' | 'REJECTED';
    response: string | null;
    createdAt: string;
    reviewedAt: string | null;
  }>;
}

@Injectable()
export class VideochatService {
  private readonly logger = new Logger(VideochatService.name);
  /** SHA-256 of each unused ticket → its user and expiry. */
  private readonly tickets = new Map<string, { userId: string; expiresAt: number }>();
  /** Tickets per account: 10 a minute (the HTTP throttle counts per IP). */
  private readonly ticketLimits = new Map<string, WindowLimiter>();
  /** Users suspended right now: the gateway disconnects them. */
  readonly suspensions = new Subject<string>();

  constructor(
    private readonly repository: VideochatRepository,
    private readonly config: AppConfigService,
    private readonly mail: MailService,
    private readonly activity: ActivityService,
  ) {}

  async status(userId: string, now: Date = new Date()): Promise<VideochatStatus> {
    const profile = await this.repository.findProfile(userId);
    const onboarded = profile?.termsVersion === VIDEOCHAT_TERMS_VERSION;
    const suspended = isSuspended(profile, now);
    const ageVerificationRequired = this.config.videochatAgeVerificationRequired;
    const ageVerified = Boolean(profile?.ageVerifiedAt);
    let suspension: VideochatStatus['suspension'] = null;
    if (suspended && profile) {
      const sanction = await this.repository.latestSuspension(userId);
      suspension = {
        reason: profile.suspensionReason,
        until: profile.suspendedUntil?.toISOString() ?? null,
        appeal: sanction?.appeal
          ? {
              status: sanction.appeal.status,
              response: sanction.appeal.response,
              createdAt: sanction.appeal.createdAt.toISOString(),
            }
          : null,
      };
    }
    return {
      onboarded,
      termsVersion: VIDEOCHAT_TERMS_VERSION,
      acceptedTermsVersion: profile?.termsVersion ?? null,
      suspended,
      suspension,
      ageVerificationRequired,
      ageVerified,
      allowed: onboarded && !suspended && (ageVerified || !ageVerificationRequired),
      profile: profile ? settingsOf(profile) : null,
      pushPublicKey: this.config.vapid?.publicKey ?? null,
    };
  }

  /** Saves the public profile and filters (from the next socket on). */
  async saveSettings(userId: string, input: VideochatSettings): Promise<VideochatSettings> {
    const profile = await this.repository.findProfile(userId);
    if (!profile) throw new ConflictException('Confirm your age and accept the rules first');
    return settingsOf(await this.repository.saveSettings(userId, input));
  }

  /** A suspended person asks the team to lift it; one appeal per suspension. */
  async appeal(userId: string, message: string, now: Date = new Date()): Promise<void> {
    const profile = await this.repository.findProfile(userId);
    if (!isSuspended(profile, now)) throw new ConflictException('Your access is not suspended');
    const sanction = await this.repository.latestSuspension(userId);
    if (!sanction || sanction.appeal) {
      throw new ConflictException('This suspension was already appealed');
    }
    await this.repository.createAppeal(userId, sanction.id, message);
  }

  async onboard(
    userId: string,
    input: OnboardingInput,
    now: Date = new Date(),
  ): Promise<VideochatStatus> {
    if (input.termsVersion !== VIDEOCHAT_TERMS_VERSION) {
      throw new ConflictException('The rules changed: read and accept the current version');
    }
    const age = ageOn(input.birthDate, now);
    if (age > 120) throw new BadRequestException('Invalid date of birth');
    if (age < VIDEOCHAT_MIN_AGE) {
      throw new ForbiddenException(`The video chat is only for people aged ${VIDEOCHAT_MIN_AGE}+`);
    }
    await this.repository.saveOnboarding(userId, input.termsVersion, now);
    return this.status(userId);
  }

  /** A single-use ticket for the WebSocket, with the ICE servers for the call. */
  async issueTicket(userId: string, now: number = Date.now()): Promise<VideochatTicket> {
    const status = await this.status(userId);
    if (status.suspended) throw new ForbiddenException('Your video chat access is suspended');
    if (!status.onboarded) throw new ConflictException('Confirm your age and accept the rules');
    if (!status.allowed) throw new ForbiddenException('Your age has to be verified first');
    this.pruneTickets(now);
    let limiter = this.ticketLimits.get(userId);
    if (!limiter) {
      limiter = new WindowLimiter(10, 60_000);
      this.ticketLimits.set(userId, limiter);
    }
    if (!limiter.take(now))
      throw new HttpException('Too many tickets', HttpStatus.TOO_MANY_REQUESTS);
    const ticket = randomBytes(32).toString('base64url');
    this.tickets.set(hash(ticket), { userId, expiresAt: now + TICKET_TTL_MS });
    return {
      ticket,
      expiresIn: TICKET_TTL_MS / 1000,
      iceServers: this.iceServers(userId, now),
    };
  }

  /** The ticket's user, once: a used, unknown or expired ticket gives undefined. */
  redeemTicket(ticket: string, now: number = Date.now()): string | undefined {
    const key = hash(ticket);
    const entry = this.tickets.get(key);
    if (!entry) return undefined;
    this.tickets.delete(key);
    return entry.expiresAt > now ? entry.userId : undefined;
  }

  /**
   * STUN as configured; TURN with time-limited credentials (coturn's `use-auth-secret`): the
   * username is `<expiry>:<user id>` and the password its HMAC-SHA1 with the shared secret.
   */
  iceServers(userId: string, now: number = Date.now()): IceServer[] {
    const { urls, secret } = this.config.turn;
    const stun = urls.filter((url) => url.startsWith('stun:'));
    const turn = urls.filter((url) => url.startsWith('turn:') || url.startsWith('turns:'));
    const servers: IceServer[] = [];
    if (stun.length > 0) servers.push({ urls: stun });
    if (turn.length > 0 && secret) {
      const username = `${Math.floor(now / 1000) + TURN_TTL_SECONDS}:${userId}`;
      const credential = createHmac('sha1', secret).update(username).digest('base64');
      servers.push({ urls: turn, username, credential });
    }
    return servers;
  }

  /** Whether the user may connect now, with their filters and what partners see of them. */
  async connection(userId: string): Promise<Connection> {
    const status = await this.status(userId);
    const profile = status.profile;
    return {
      allowed: status.allowed,
      prefs: profile
        ? {
            gender: profile.gender,
            seeking: profile.seeking,
            country: profile.country,
            language: profile.language,
            sameCountryOnly: profile.sameCountryOnly,
            sameLanguageOnly: profile.sameLanguageOnly,
          }
        : undefined,
      publicProfile: {
        nickname: profile?.nickname ?? null,
        gender: profile?.gender ?? null,
        country: profile?.country ?? null,
        language: profile?.language ?? null,
        interests: profile ? knownInterests(profile.interests) : [],
      },
    };
  }

  /** Whether the user may connect now. */
  async canConnect(userId: string): Promise<boolean> {
    return (await this.status(userId)).allowed;
  }

  blockedUserIds(userId: string): Promise<string[]> {
    return this.repository.blockedUserIds(userId);
  }

  block(blockerId: string, blockedId: string): Promise<void> {
    return this.repository.block(blockerId, blockedId);
  }

  /** "I like them"; true when they had liked me too (we are contacts now). */
  like(userId: string, otherId: string): Promise<boolean> {
    return this.repository.like(userId, otherId);
  }

  /** Whether two people are contacts (liked each other). */
  areContacts(a: string, b: string): Promise<boolean> {
    return this.repository.isMutual(a, b);
  }

  /** My contacts, newest first, with where they are now (`presence`, from the gateway). */
  async contacts(
    userId: string,
    presence: (contactId: string) => { online: boolean; busy: boolean },
  ): Promise<{ items: VideochatContact[] }> {
    const rows = await this.repository.contacts(userId);
    return {
      items: rows.map((row) => {
        const profile = row.to.videochatProfile;
        return {
          contactId: row.toId,
          nickname: profile?.nickname ?? null,
          gender: profile?.gender ?? null,
          country: profile?.country ?? null,
          language: profile?.language ?? null,
          interests: knownInterests(profile?.interests),
          ...presence(row.toId),
          since: row.createdAt.toISOString(),
        };
      }),
    };
  }

  /** Stops being someone's contact (my like goes; theirs stays). */
  removeContact(userId: string, contactId: string): Promise<void> {
    return this.repository.unlike(userId, contactId);
  }

  /** Records a report from a call; suspends the reported account after several of them. */
  async report(input: {
    reporterId: string;
    reportedId: string;
    reason: ReportReason;
    details?: string;
    transcript: TranscriptLine[];
  }): Promise<void> {
    const report = await this.repository.createReport({
      reporterId: input.reporterId,
      reportedId: input.reportedId,
      reason: input.reason,
      details: input.details || null,
      transcript: input.transcript as unknown as object[],
    });
    const now = new Date();
    const reporters = await this.repository.distinctReporters(
      input.reportedId,
      new Date(now.getTime() - DAY_MS),
    );
    // Automatic suspensions last until the team reviews them, and don't replace a current one.
    const profile = await this.repository.findProfile(input.reportedId);
    if (profile && !isSuspended(profile, now)) {
      if (input.reason === 'MINOR') {
        // Explicit content is allowed, so a possible minor can't wait for the team: suspended at
        // once, and the team reviews it first (and lifts it if the report was wrong).
        await this.suspendUser(SYSTEM, {
          userId: input.reportedId,
          reason: 'Automatic: reported as possibly under 18',
          duration: 'permanent',
          reportId: report.id,
          now,
        });
      } else if (reporters >= AUTO_SUSPEND_REPORTERS) {
        await this.suspendUser(SYSTEM, {
          userId: input.reportedId,
          reason: `Automatic: reported by ${reporters} people within 24 hours`,
          duration: 'permanent',
          reportId: report.id,
          now,
        });
      }
    }
    if (input.reason === 'MINOR') {
      // The team looks at these first; the email has no personal data, only the link.
      this.mail
        .send(minorReportEmail(this.config.leadsNotifyTo, report.id, this.config.siteUrl))
        .catch((error: unknown) => this.logger.error(`Report alert not sent: ${String(error)}`));
    }
  }

  // --- Admin ---------------------------------------------------------------------------------

  async listReports(status: 'OPEN' | 'DISMISSED' | 'ACTIONED'): Promise<ReportView[]> {
    const reports = await this.repository.listReports(status);
    const counts = await this.repository.reportCounts(
      [...new Set(reports.map((report) => report.reportedId))],
      new Date(Date.now() - 30 * DAY_MS),
    );
    return reports.map((report) => ({
      id: report.id,
      reason: report.reason,
      details: report.details,
      transcript: Array.isArray(report.transcript)
        ? (report.transcript as unknown as TranscriptLine[])
        : [],
      status: report.status,
      createdAt: report.createdAt.toISOString(),
      reviewedAt: report.reviewedAt?.toISOString() ?? null,
      reviewedBy: report.reviewedBy
        ? { id: report.reviewedBy.id, name: report.reviewedBy.name }
        : null,
      reporter: report.reporter,
      reported: {
        id: report.reported.id,
        name: report.reported.name,
        email: report.reported.email,
        suspendedAt: isSuspended(report.reported.videochatProfile)
          ? (report.reported.videochatProfile?.suspendedAt?.toISOString() ?? null)
          : null,
        recentReports: counts.get(report.reportedId) ?? 0,
      },
    }));
  }

  async dismissReport(admin: AuthUser, id: string): Promise<void> {
    const report = await this.findReport(id);
    await this.repository.reviewReport(id, 'DISMISSED', admin.id, new Date());
    await this.activity.record(admin, {
      action: 'videochat.report_dismissed',
      targetId: report.reportedId,
      targetLabel: await this.labelOf(report.reportedId),
      details: { reason: report.reason },
    });
  }

  /** Suspends the reported account and closes the report as acted on. */
  async suspendFromReport(
    admin: AuthUser,
    id: string,
    reason: string | undefined,
    duration: SuspensionDuration,
  ): Promise<void> {
    const report = await this.findReport(id);
    const now = new Date();
    await this.suspendUser(admin, {
      userId: report.reportedId,
      reason: reason ?? `Report: ${report.reason}`,
      duration,
      reportId: report.id,
      now,
    });
    await this.repository.reviewReport(id, 'ACTIONED', admin.id, now);
  }

  /** The team suspends someone from their page. */
  async suspend(
    admin: AuthUser,
    userId: string,
    reason: string,
    duration: SuspensionDuration,
  ): Promise<void> {
    if (!(await this.repository.findProfile(userId))) {
      throw new NotFoundException('That account has not joined the video chat');
    }
    await this.suspendUser(admin, { userId, reason, duration, reportId: null, now: new Date() });
  }

  /** Records that the team checked the person's age by hand (or clears it). */
  async setAgeVerified(admin: AuthUser, userId: string, verified: boolean): Promise<void> {
    if (!(await this.repository.setAgeVerified(userId, verified ? new Date() : null))) {
      throw new NotFoundException('That account has not joined the video chat');
    }
    await this.activity.record(admin, {
      action: verified ? 'videochat.age_verified' : 'videochat.age_unverified',
      targetId: userId,
      targetLabel: await this.labelOf(userId),
    });
  }

  async listSuspensions(): Promise<SuspensionView[]> {
    const profiles = await this.repository.listSuspended(new Date());
    return profiles.map((profile) => ({
      user: profile.user,
      suspendedAt: (profile.suspendedAt as Date).toISOString(),
      until: profile.suspendedUntil?.toISOString() ?? null,
      reason: profile.suspensionReason,
    }));
  }

  async liftSuspension(
    admin: AuthUser,
    userId: string,
    reason: string | null = null,
  ): Promise<void> {
    if (!(await this.repository.unsuspend(userId, admin.id, reason))) {
      throw new NotFoundException('That account is not suspended');
    }
    await this.activity.record(admin, {
      action: 'videochat.unsuspended',
      targetId: userId,
      targetLabel: await this.labelOf(userId),
    });
  }

  async listAppeals(status: 'OPEN' | 'ACCEPTED' | 'REJECTED'): Promise<AppealView[]> {
    const appeals = await this.repository.listAppeals(status);
    return appeals.map((appeal) => ({
      id: appeal.id,
      message: appeal.message,
      status: appeal.status,
      response: appeal.response,
      createdAt: appeal.createdAt.toISOString(),
      reviewedAt: appeal.reviewedAt?.toISOString() ?? null,
      user: appeal.user,
      sanction: {
        reason: appeal.sanction.reason,
        until: appeal.sanction.until?.toISOString() ?? null,
        createdAt: appeal.sanction.createdAt.toISOString(),
      },
    }));
  }

  /** Accepting lifts the suspension; either way the person gets an email. */
  async resolveAppeal(
    admin: AuthUser,
    id: string,
    accepted: boolean,
    response: string | undefined,
  ): Promise<void> {
    const appeal = await this.repository.findAppeal(id);
    if (!appeal) throw new NotFoundException('Appeal not found');
    const now = new Date();
    const status = accepted ? 'ACCEPTED' : 'REJECTED';
    if (!(await this.repository.resolveAppeal(id, status, response ?? null, admin.id, now))) {
      throw new ConflictException('This appeal was already resolved');
    }
    if (accepted) {
      await this.repository.unsuspend(appeal.userId, admin.id, 'Appeal accepted');
    }
    await this.activity.record(admin, {
      action: accepted ? 'videochat.appeal_accepted' : 'videochat.appeal_rejected',
      targetId: appeal.userId,
      targetLabel: appeal.user.name || appeal.user.email,
    });
    const locale = toApiLocale(appeal.user.locale);
    this.mail
      .send(
        appealResolvedEmail(
          { to: appeal.user.email, name: appeal.user.name, locale },
          { accepted, response: response ?? null },
          this.config.webappUrl('videochat'),
          this.config.siteUrl,
        ),
      )
      .catch((error: unknown) => this.logger.error(`Appeal email not sent: ${String(error)}`));
  }

  async userDetail(userId: string): Promise<UserDetailView> {
    const user = await this.repository.userDetail(userId);
    const profile = user?.videochatProfile;
    if (!user || !profile)
      throw new NotFoundException('That account has not joined the video chat');
    const person = (p: Person): Person => ({ id: p.id, name: p.name, email: p.email });
    return {
      user: { ...person(user), createdAt: user.createdAt.toISOString() },
      profile: settingsOf(profile),
      suspension: isSuspended(profile)
        ? {
            since: (profile.suspendedAt as Date).toISOString(),
            until: profile.suspendedUntil?.toISOString() ?? null,
            reason: profile.suspensionReason,
          }
        : null,
      ageVerified: Boolean(profile.ageVerifiedAt),
      onboardedAt: profile.adultConfirmedAt.toISOString(),
      reportsReceived: user.videochatReportsGot.map((report) => ({
        id: report.id,
        reason: report.reason,
        status: report.status,
        details: report.details,
        createdAt: report.createdAt.toISOString(),
        reporter: person(report.reporter),
      })),
      reportsMade: user.videochatReportsMade.map((report) => ({
        id: report.id,
        reason: report.reason,
        status: report.status,
        details: report.details,
        createdAt: report.createdAt.toISOString(),
        reported: person(report.reported),
      })),
      sanctions: user.videochatSanctions.map((sanction) => ({
        id: sanction.id,
        kind: sanction.kind,
        reason: sanction.reason,
        until: sanction.until?.toISOString() ?? null,
        createdAt: sanction.createdAt.toISOString(),
        by: sanction.by ? person(sanction.by) : null,
      })),
      appeals: user.videochatAppeals.map((appeal) => ({
        id: appeal.id,
        message: appeal.message,
        status: appeal.status,
        response: appeal.response,
        createdAt: appeal.createdAt.toISOString(),
        reviewedAt: appeal.reviewedAt?.toISOString() ?? null,
      })),
    };
  }

  private async suspendUser(
    actor: ActivityActor,
    input: {
      userId: string;
      reason: string;
      duration: SuspensionDuration;
      reportId: string | null;
      now: Date;
    },
  ): Promise<void> {
    const until = suspensionEnd(input.duration, input.now);
    await this.repository.suspend({
      userId: input.userId,
      reason: input.reason,
      until,
      now: input.now,
      byId: actor.id,
      reportId: input.reportId,
    });
    this.suspensions.next(input.userId);
    await this.activity.record(actor, {
      action: 'videochat.suspended',
      targetId: input.userId,
      targetLabel: await this.labelOf(input.userId),
      details: { reason: input.reason, until: until?.toISOString() ?? null },
    });
  }

  private async labelOf(userId: string): Promise<string | null> {
    const user = await this.repository.findUser(userId);
    return user ? user.name || user.email : null;
  }

  private async findReport(id: string) {
    const report = await this.repository.findReport(id);
    if (!report) throw new NotFoundException('Report not found');
    return report;
  }

  private pruneTickets(now: number): void {
    for (const [key, entry] of this.tickets) {
      if (entry.expiresAt <= now) this.tickets.delete(key);
    }
    // Limiters of people who haven't asked for a while start again from zero anyway.
    if (this.ticketLimits.size > 10_000) this.ticketLimits.clear();
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
