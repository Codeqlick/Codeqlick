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
import { AppConfigService } from '../../config/app-config.service.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { MailService } from '../mail/mail.service.js';
import { WindowLimiter } from './matchmaker.js';
import { minorReportEmail } from './videochat-emails.js';
import { VideochatRepository } from './videochat.repository.js';
import {
  ageOn,
  VIDEOCHAT_MIN_AGE,
  VIDEOCHAT_TERMS_VERSION,
  type OnboardingInput,
  type ReportReason,
} from './videochat.schemas.js';

/** A ticket opens one WebSocket, once, within this time. */
export const TICKET_TTL_MS = 30_000;
/** TURN credentials last this long (a long call keeps working). */
const TURN_TTL_SECONDS = 12 * 60 * 60;
/** Reports from this many different people within a day suspend the account until reviewed. */
export const AUTO_SUSPEND_REPORTERS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface VideochatStatus {
  /** 18+ confirmed and the current terms accepted. */
  onboarded: boolean;
  termsVersion: string;
  acceptedTermsVersion: string | null;
  suspended: boolean;
  /** The platform asks for a verified age, not only a declared one. */
  ageVerificationRequired: boolean;
  /** This person's age was verified for real. */
  ageVerified: boolean;
  /** May use the video chat now: onboarded, not suspended, age verified when required. */
  allowed: boolean;
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
    suspendedAt: string | null;
    /** Reports against them in the last 30 days. */
    recentReports: number;
  };
}

export interface SuspensionView {
  user: { id: string; name: string; email: string };
  suspendedAt: string;
  reason: string | null;
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
  ) {}

  async status(userId: string): Promise<VideochatStatus> {
    const profile = await this.repository.findProfile(userId);
    const onboarded = profile?.termsVersion === VIDEOCHAT_TERMS_VERSION;
    const suspended = Boolean(profile?.suspendedAt);
    const ageVerificationRequired = this.config.videochatAgeVerificationRequired;
    const ageVerified = Boolean(profile?.ageVerifiedAt);
    return {
      onboarded,
      termsVersion: VIDEOCHAT_TERMS_VERSION,
      acceptedTermsVersion: profile?.termsVersion ?? null,
      suspended,
      ageVerificationRequired,
      ageVerified,
      allowed: onboarded && !suspended && (ageVerified || !ageVerificationRequired),
    };
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
    if (input.reason === 'MINOR') {
      // Explicit content is allowed, so a possible minor can't wait for the team: suspended at
      // once, and the team reviews it first (and lifts it if the report was wrong).
      await this.suspendUser(input.reportedId, 'Automatic: reported as possibly under 18', now);
    } else if (reporters >= AUTO_SUSPEND_REPORTERS) {
      await this.suspendUser(
        input.reportedId,
        `Automatic: reported by ${reporters} people within 24 hours`,
        now,
      );
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
        suspendedAt: report.reported.videochatProfile?.suspendedAt?.toISOString() ?? null,
        recentReports: counts.get(report.reportedId) ?? 0,
      },
    }));
  }

  async dismissReport(admin: AuthUser, id: string): Promise<void> {
    await this.findReport(id);
    await this.repository.reviewReport(id, 'DISMISSED', admin.id, new Date());
  }

  /** Suspends the reported account and closes the report as acted on. */
  async suspendFromReport(admin: AuthUser, id: string, reason?: string): Promise<void> {
    const report = await this.findReport(id);
    const now = new Date();
    await this.suspendUser(report.reportedId, reason ?? `Report: ${report.reason}`, now);
    await this.repository.reviewReport(id, 'ACTIONED', admin.id, now);
  }

  /** Records that the team checked the person's age by hand (or clears it). */
  async setAgeVerified(userId: string, verified: boolean): Promise<void> {
    if (!(await this.repository.setAgeVerified(userId, verified ? new Date() : null))) {
      throw new NotFoundException('That account has not joined the video chat');
    }
  }

  async listSuspensions(): Promise<SuspensionView[]> {
    const profiles = await this.repository.listSuspended();
    return profiles.map((profile) => ({
      user: profile.user,
      suspendedAt: (profile.suspendedAt as Date).toISOString(),
      reason: profile.suspensionReason,
    }));
  }

  async liftSuspension(userId: string): Promise<void> {
    if (!(await this.repository.unsuspend(userId))) {
      throw new NotFoundException('That account is not suspended');
    }
  }

  private async suspendUser(userId: string, reason: string, now: Date): Promise<void> {
    await this.repository.suspend(userId, reason, now);
    this.suspensions.next(userId);
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
