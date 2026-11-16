import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, hkdfSync, randomBytes, randomUUID } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service.js';
import {
  siteLocale,
  toApiLocale,
  toDbLocale,
  type ApiLocale,
} from '../../common/schemas/common.schemas.js';
import { DISPOSABLE_EMAIL_ERROR, isDisposableEmail } from '../../common/disposable-email.js';
import type { AccessTokenPayload, AuthUser } from '../../common/types/auth-user.js';
import { describeUserAgent, deviceKey } from '../../common/user-agent.js';
import type { User } from '../../generated/prisma/client.js';
import { AuthRepository, type CreateSessionData } from './auth.repository.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService } from '../mail/mail.service.js';
import {
  alreadyRegisteredEmail,
  invitationEmail,
  newDeviceSignInEmail,
  passwordResetEmail,
  signupConfirmEmail,
  signupInvitationEmail,
  type SignupReason,
} from './auth-emails.js';
import type { AcceptInvitationInput, RegisterInput } from './auth.schemas.js';
import { PasswordBreachService } from './password-breach.service.js';
import { PasswordService } from './password.service.js';
import { SecretBox } from './secret-box.js';
import { generateTotpSecret, otpauthUri, verifyTotp } from './totp.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

/** Answer to a correct password when the account has two-step verification on. */
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  /** Short-lived token to send back with the code to `POST /auth/2fa/verify`. */
  challengeToken: string;
}

export type LoginResult = AuthTokens | TwoFactorChallenge;

export interface Preferences {
  /** The Monday summary of the user's projects (clients). */
  weeklyDigest: boolean;
  /** The monthly report of their managed website (clients). */
  monthlyReport: boolean;
  /** The language of their emails (read only here: `PATCH /auth/me` changes it). */
  locale?: ApiLocale;
}

export interface TwoFactorStatus {
  enabled: boolean;
  recoveryCodesLeft: number;
  /** This account can't use its area without it (admins, with ADMIN_TWO_FACTOR_REQUIRED). */
  required: boolean;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
}

/** How long the step between password and code may take. */
const CHALLENGE_TTL_SECONDS = 300;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

function normalizeRecoveryCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

/** `xxxx-xxxx` from an alphabet without look-alike characters. */
function generateRecoveryCode(): string {
  const chars = [...randomBytes(8)].map(
    (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length],
  );
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

export interface ClientInfo {
  userAgent?: string | null;
  ip?: string | null;
}

/** A signed-in device: one refresh-token family, described by its latest rotation. */
export interface ActiveSession {
  /** The family id: stable across refreshes. */
  id: string;
  userAgent: string | null;
  ip: string | null;
  /** When the session was last refreshed (about every 15 minutes while in use). */
  lastActiveAt: string;
  /** Whether this is the session the request was made with. */
  current: boolean;
  /** Single sign-on (decision 108): the app or website it belongs to; null on the account host. */
  client: string | null;
  /** The account session it came from (its family id), or null. */
  parentId: string | null;
}

/** What a single sign-on session is for (decision 108). */
export interface SsoSessionInfo {
  client: string;
  parentFamilyId: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a password reset link works. */
export const PASSWORD_RESET_TTL_MINUTES = 60;

/** How long the set-your-password link of a welcome email works. */
export const INVITATION_TTL_DAYS = 7;
/** How long the link that confirms a self-registration works. */
export const SIGNUP_TTL_HOURS = 24;

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function toAuthUser(
  user: Pick<User, 'id' | 'email' | 'name' | 'role'> & {
    memberOfId?: string | null;
    username?: string | null;
    avatarKey?: string | null;
  },
): AuthUser {
  const base: AuthUser = { id: user.id, email: user.email, name: user.name, role: user.role };
  if (user.username !== undefined) base.username = user.username;
  if (user.avatarKey !== undefined) base.avatar = user.avatarKey;
  // Clients act for a client account: their own, or their company's.
  return user.role === 'CLIENT' ? { ...base, accountId: user.memberOfId ?? user.id } : base;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly secrets: SecretBox;
  /** Challenge tokens use their own key, so they can never pass as access tokens. */
  private readonly challengeKey: string;

  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
    private readonly mail: MailService,
    private readonly activity: ActivityService,
    private readonly breaches: PasswordBreachService,
  ) {
    this.secrets = new SecretBox(config.jwtAccessSecret);
    this.challengeKey = Buffer.from(
      hkdfSync('sha256', config.jwtAccessSecret, 'codeqlick', 'two-factor-challenge-v1', 32),
    ).toString('base64');
  }

  async login(email: string, password: string, client: ClientInfo = {}): Promise<LoginResult> {
    const user = await this.repository.findUserByEmail(email.trim().toLowerCase());
    if (!user) {
      await this.passwords.verifyDummy(password);
      throw new UnauthorizedException('Invalid email or password');
    }
    const valid = await this.passwords.verify(user.passwordHash, password);
    // An account the team prepared can't be signed in to until its owner registers (decision 17).
    if (!valid || !user.isActive || !user.registeredAt) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.totpEnabledAt) {
      const challengeToken = await this.jwt.signAsync(
        { sub: user.id, purpose: '2fa' },
        { secret: this.challengeKey, expiresIn: CHALLENGE_TTL_SECONDS },
      );
      return { twoFactorRequired: true, challengeToken };
    }

    return this.signIn(user, client);
  }

  async refresh(refreshToken: string, client: ClientInfo = {}): Promise<AuthTokens> {
    const session = await this.repository.findSessionByTokenHash(hashRefreshToken(refreshToken));
    if (!session) throw new UnauthorizedException('Invalid refresh token');

    if (session.revokedAt && !session.replacedById) {
      // Signed out (logout, password change, or from the sessions list): not a stolen token.
      throw new UnauthorizedException('Session ended');
    }
    if (session.revokedAt) {
      // An already-rotated token came back: assume theft, kill the family.
      this.logger.warn(`Refresh token reuse detected for family ${session.familyId}`);
      await this.repository.revokeFamily(session.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }
    if (!session.user.isActive) {
      await this.repository.revokeFamily(session.familyId);
      throw new UnauthorizedException('Account disabled');
    }

    const nextToken = this.generateRefreshToken();
    // A single sign-on session keeps its app and its parent across rotations (decision 108).
    const sso =
      session.client && session.parentFamilyId
        ? { client: session.client, parentFamilyId: session.parentFamilyId }
        : undefined;
    const next = this.buildSession(session.userId, nextToken, session.familyId, client, sso);
    const rotated = await this.repository.rotateSession(session.id, next);
    if (!rotated) {
      // Lost a race against another refresh with the same token: same as reuse.
      await this.repository.revokeFamily(session.familyId);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    return this.issueTokens(session.user, nextToken, session.familyId);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const session = await this.repository.findSessionByTokenHash(hashRefreshToken(refreshToken));
    if (session && session.userId === userId) {
      await this.repository.revokeSession(session.id);
    }
  }

  async listSessions(userId: string, currentFamilyId?: string): Promise<ActiveSession[]> {
    const rows = await this.repository.listActiveSessions(userId, new Date());
    return rows.map((row) => ({
      id: row.familyId,
      userAgent: row.userAgent,
      ip: row.ip,
      lastActiveAt: row.createdAt.toISOString(),
      current: row.familyId === currentFamilyId,
      client: row.client,
      parentId: row.parentFamilyId,
    }));
  }

  /** Signs out one of the caller's sessions (possibly the current one). */
  async revokeSession(user: AuthUser, familyId: string): Promise<void> {
    if (!(await this.repository.revokeUserFamily(user.id, familyId))) {
      throw new NotFoundException('Session not found');
    }
    await this.activity.record(user, {
      action: 'account.sessions_revoked',
      targetId: user.id,
      targetLabel: user.email,
      details: { scope: 'one' },
    });
  }

  /** Signs out every other session; the one that owns `refreshToken` stays signed in. */
  async revokeOtherSessions(user: AuthUser, refreshToken: string): Promise<void> {
    const session = await this.repository.findSessionByTokenHash(hashRefreshToken(refreshToken));
    if (!session || session.userId !== user.id || session.revokedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    await this.repository.revokeOtherFamilies(user.id, session.familyId);
    await this.activity.record(user, {
      action: 'account.sessions_revoked',
      targetId: user.id,
      targetLabel: user.email,
      details: { scope: 'others' },
    });
  }

  /**
   * "Sign out of this device everywhere" (decision 108): the account session of this browser (the
   * one owning `refreshToken`, or its parent when it is an app's) and every session made from it.
   */
  async revokeDevice(user: AuthUser, refreshToken: string): Promise<void> {
    const session = await this.repository.findSessionByTokenHash(hashRefreshToken(refreshToken));
    if (!session || session.userId !== user.id || session.revokedAt) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    await this.repository.revokeUserFamily(user.id, session.parentFamilyId ?? session.familyId);
    await this.activity.record(user, {
      action: 'account.sessions_revoked',
      targetId: user.id,
      targetLabel: user.email,
      details: { scope: 'device' },
    });
  }

  /** "Sign out of all devices": every session of the account, this one included. */
  async revokeAllSessions(user: AuthUser): Promise<void> {
    await this.repository.revokeAllFamilies(user.id);
    await this.activity.record(user, {
      action: 'account.sessions_revoked',
      targetId: user.id,
      targetLabel: user.email,
      details: { scope: 'all' },
    });
  }

  /** The caller's own email preferences. */
  async preferences(userId: string): Promise<Preferences> {
    const user = await this.activeUser(userId);
    return {
      weeklyDigest: user.weeklyDigest,
      monthlyReport: user.monthlyReport,
      locale: toApiLocale(user.locale),
    };
  }

  async updatePreferences(userId: string, input: Partial<Preferences>): Promise<Preferences> {
    await this.activeUser(userId);
    const user = await this.repository.setPreferences(userId, input);
    return { weeklyDigest: user.weeklyDigest, monthlyReport: user.monthlyReport };
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.repository.findUserById(userId);
    if (!user || !user.isActive) throw new UnauthorizedException('Account not available');
    return toAuthUser(user);
  }

  /**
   * Changes the caller's own password. Sessions on other devices are revoked; the one that owns
   * `refreshToken` stays signed in.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    refreshToken: string,
  ): Promise<void> {
    const user = await this.repository.findUserById(userId);
    if (!user || !user.isActive) throw new UnauthorizedException('Account not available');

    // 400 with a field error, not 401: the caller is signed in, they just mistyped a form field.
    if (!(await this.passwords.verify(user.passwordHash, currentPassword))) {
      throw new BadRequestException({
        errors: [{ path: 'currentPassword', message: 'Current password is incorrect' }],
      });
    }
    if (newPassword === currentPassword) {
      throw new BadRequestException({
        errors: [{ path: 'newPassword', message: 'Choose a password you are not already using' }],
      });
    }
    await this.breaches.assertNotBreached(newPassword, 'newPassword');

    await this.repository.changePassword(
      user.id,
      await this.passwords.hash(newPassword),
      hashRefreshToken(refreshToken),
    );
    await this.activity.record(toAuthUser(user), {
      action: 'account.password_changed',
      targetId: user.id,
      targetLabel: user.email,
    });
  }

  /**
   * Emails a reset link when `email` belongs to an active account. It never tells the caller
   * whether it does, and the email is sent in the background so timing doesn't either.
   */
  async requestPasswordReset(email: string, locale: ApiLocale): Promise<void> {
    const user = await this.repository.findUserByEmail(email.trim().toLowerCase());
    if (!user || !user.isActive) return;
    if (!user.registeredAt) {
      // Never registered: what they need is the invitation to create the account.
      await this.sendSignupInvitation(user, locale, 'account').catch(() => undefined);
      return;
    }

    const token = this.generateRefreshToken();
    await this.repository.replacePasswordResetToken(
      user.id,
      hashRefreshToken(token),
      new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
    );

    const link = `${this.config.accountUrl}/${locale}/reset-password?token=${token}`;
    const message = passwordResetEmail(
      user,
      link,
      locale,
      PASSWORD_RESET_TTL_MINUTES,
      this.config.siteUrl,
    );
    this.mail.send(message).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send password reset email: ${reason}`);
    });
  }

  /**
   * Emails a welcome message with a link to choose a password: the same kind of token as a reset
   * (so the same page spends it), valid for days instead of an hour. Unlike a reset it reports a
   * failed send, so the admin who asked for it knows.
   */
  async sendInvitation(
    user: Pick<User, 'id' | 'name' | 'email'>,
    locale: ApiLocale,
  ): Promise<void> {
    const token = this.generateRefreshToken();
    await this.repository.replacePasswordResetToken(
      user.id,
      hashRefreshToken(token),
      new Date(Date.now() + INVITATION_TTL_DAYS * DAY_MS),
    );
    const link = `${this.config.accountUrl}/${locale}/reset-password?token=${token}&welcome=1`;
    await this.mail.send(
      invitationEmail(user, link, locale, INVITATION_TTL_DAYS, this.config.siteUrl),
    );
  }

  /**
   * The team's invitation to create the account it prepared for an email (decision 17). Throws when
   * the email can't be sent.
   */
  async sendSignupInvitation(
    user: Pick<User, 'id' | 'name' | 'email'>,
    locale: ApiLocale,
    reason: SignupReason,
  ): Promise<void> {
    const link = await this.signupInvitationLink(user, locale);
    await this.mail.send(
      signupInvitationEmail(user, link, locale, INVITATION_TTL_DAYS, reason, this.config.siteUrl),
    );
  }

  /** A new link to accept the invitation (earlier ones stop working), for emails that carry it. */
  async signupInvitationLink(user: Pick<User, 'id'>, locale: ApiLocale): Promise<string> {
    const token = this.generateRefreshToken();
    await this.repository.replacePasswordResetToken(
      user.id,
      hashRefreshToken(token),
      new Date(Date.now() + INVITATION_TTL_DAYS * DAY_MS),
    );
    return `${this.config.accountUrl}/${locale}/register?invitation=${token}`;
  }

  /**
   * Self-registration (decision 17): emails the link that confirms it, or, when the email already
   * has an account, says so. Never tells the caller which happened.
   */
  async register(input: RegisterInput): Promise<void> {
    if (input.website && input.website.trim() !== '') return;
    const email = input.email.trim().toLowerCase();
    if (isDisposableEmail(email)) {
      throw new BadRequestException({ errors: [DISPOSABLE_EMAIL_ERROR] });
    }
    // Before looking the email up: the answer must not depend on whether it has an account.
    await this.breaches.assertNotBreached(input.password, 'password');
    const existing = await this.repository.findUserByEmail(email);
    const site = this.config.siteUrl;
    // Signing in and up happens on the account host (decision 108); from a web app the
    // confirmation then sends the person on to it (`app`).
    const linkBase = this.config.accountUrl;
    const appParam = input.app ? `&app=${input.app}` : '';
    // Only Cruising speaks FR, DE, IT and PT (decision 103): its links keep them, the emails and
    // every other page fall back to English.
    const mailLocale = siteLocale(input.locale);
    const linkLocale = input.app === 'cruising' ? input.locale : mailLocale;
    let message;
    if (existing?.registeredAt) {
      if (!existing.isActive) return;
      message = alreadyRegisteredEmail(
        existing,
        {
          // Their app's (or the website's) sign-in: it goes through the account host and back.
          login: `${input.app ? this.config.webappUrl(input.app) : site}/${linkLocale}/login`,
          reset: `${linkBase}/${linkLocale}/forgot-password`,
        },
        mailLocale,
        site,
      );
    } else {
      if (existing && !existing.isActive) return;
      const token = this.generateRefreshToken();
      await this.repository.createSignupToken({
        email,
        name: input.name,
        passwordHash: await this.passwords.hash(input.password),
        locale: toDbLocale(input.locale),
        tokenHash: hashRefreshToken(token),
        expiresAt: new Date(Date.now() + SIGNUP_TTL_HOURS * 3_600_000),
        app: input.app ?? null,
      });
      message = signupConfirmEmail(
        { name: input.name, email },
        `${linkBase}/${linkLocale}/register/confirm?token=${token}${appParam}`,
        mailLocale,
        SIGNUP_TTL_HOURS,
        site,
      );
    }
    this.mail.send(message).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send a sign-up email: ${reason}`);
    });
  }

  /** The emailed link of a self-registration: the account is theirs and they are signed in. */
  async confirmSignup(token: string, client: ClientInfo = {}): Promise<AuthTokens> {
    const user = await this.repository.confirmSignup(hashRefreshToken(token));
    if (!user) throw new BadRequestException('This link is invalid or has expired');
    await this.activity.record(toAuthUser(user), {
      action: 'account.registered',
      targetId: user.id,
      targetLabel: user.email,
    });
    return this.startSession(user, client);
  }

  /** Who an invitation is for, to fill in the sign-up form. */
  async invitation(token: string): Promise<{ email: string; name: string }> {
    const user = await this.repository.findInvitation(hashRefreshToken(token));
    if (!user) throw new BadRequestException('This invitation is invalid or has expired');
    return { email: user.email, name: user.name };
  }

  /** Accepts the team's invitation: the account is theirs at once and they are signed in. */
  async acceptInvitation(
    input: AcceptInvitationInput,
    client: ClientInfo = {},
  ): Promise<AuthTokens> {
    await this.breaches.assertNotBreached(input.password, 'password');
    const user = await this.repository.acceptInvitation(hashRefreshToken(input.token), {
      name: input.name,
      passwordHash: await this.passwords.hash(input.password),
      locale: toDbLocale(input.locale),
    });
    if (!user) throw new BadRequestException('This invitation is invalid or has expired');
    await this.activity.record(toAuthUser(user), {
      action: 'account.registered',
      targetId: user.id,
      targetLabel: user.email,
      details: { invited: true },
    });
    return this.startSession(user, client);
  }

  /** Sets a new password with the token from the email and signs the user out everywhere. */
  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
    // Before the token is spent, so the person can try another password with the same link.
    await this.breaches.assertNotBreached(newPassword, 'newPassword');
    const done = await this.repository.resetPassword(hashRefreshToken(token), () =>
      this.passwords.hash(newPassword),
    );
    if (!done) throw new BadRequestException('This reset link is invalid or has expired');
  }

  /** Second step of a login with two-step verification: the code finishes the sign-in. */
  async verifyTwoFactor(
    challengeToken: string,
    code: string,
    client: ClientInfo = {},
  ): Promise<AuthTokens> {
    let payload: { sub?: unknown; purpose?: unknown };
    try {
      payload = await this.jwt.verifyAsync(challengeToken, { secret: this.challengeKey });
    } catch {
      throw new UnauthorizedException('The sign-in expired, start again');
    }
    if (payload.purpose !== '2fa' || typeof payload.sub !== 'string') {
      throw new UnauthorizedException('The sign-in expired, start again');
    }
    const user = await this.repository.findUserById(payload.sub);
    if (!user || !user.isActive || !user.totpEnabledAt) {
      throw new UnauthorizedException('The sign-in expired, start again');
    }
    if (!(await this.checkSecondFactor(user, code))) {
      throw new UnauthorizedException('Invalid code');
    }

    return this.signIn(user, client);
  }

  async twoFactorStatus(userId: string): Promise<TwoFactorStatus> {
    const user = await this.activeUser(userId);
    return {
      enabled: Boolean(user.totpEnabledAt),
      recoveryCodesLeft: user.totpEnabledAt ? user.totpRecoveryHashes.length : 0,
      required: this.twoFactorRequired(user.role),
    };
  }

  private twoFactorRequired(role: string): boolean {
    return role === 'ADMIN' && this.config.adminTwoFactorRequired;
  }

  /** Starts (or restarts) setting up an authenticator app. Nothing changes for sign-in yet. */
  async startTwoFactorSetup(userId: string): Promise<TwoFactorSetup> {
    const user = await this.activeUser(userId);
    if (user.totpEnabledAt) throw new ConflictException('Two-step verification is already on');
    const secret = generateTotpSecret();
    await this.repository.setPendingTotp(user.id, this.secrets.seal(secret));
    return { secret, otpauthUrl: otpauthUri(secret, user.email, 'Codeqlick') };
  }

  /** Confirms the setup with a first code. Returns the recovery codes: shown once, never again. */
  async enableTwoFactor(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const user = await this.activeUser(userId);
    if (user.totpEnabledAt) throw new ConflictException('Two-step verification is already on');
    if (!user.totpSecret) throw new BadRequestException('Start the setup first');

    const step = verifyTotp(this.secrets.open(user.totpSecret), code, Date.now());
    if (step === undefined) {
      throw new BadRequestException({ errors: [{ path: 'code', message: 'Invalid code' }] });
    }
    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await this.repository.enableTotp(user.id, step, recoveryCodes.map(hashRecoveryCode));
    await this.activity.record(toAuthUser(user), {
      action: 'account.two_factor_enabled',
      targetId: user.id,
      targetLabel: user.email,
    });
    return { recoveryCodes };
  }

  /** Turns it off. Needs the password and a current code (or a recovery code). */
  async disableTwoFactor(userId: string, password: string, code: string): Promise<void> {
    const user = await this.activeUser(userId);
    if (!user.totpEnabledAt) throw new ConflictException('Two-step verification is already off');
    if (this.twoFactorRequired(user.role)) {
      throw new ConflictException('Two-step verification is required for admin accounts');
    }
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw new BadRequestException({
        errors: [{ path: 'password', message: 'Current password is incorrect' }],
      });
    }
    if (!(await this.checkSecondFactor(user, code))) {
      throw new BadRequestException({ errors: [{ path: 'code', message: 'Invalid code' }] });
    }
    await this.repository.disableTotp(user.id);
    await this.activity.record(toAuthUser(user), {
      action: 'account.two_factor_disabled',
      targetId: user.id,
      targetLabel: user.email,
    });
  }

  private async activeUser(userId: string): Promise<User> {
    const user = await this.repository.findUserById(userId);
    if (!user || !user.isActive) throw new UnauthorizedException('Account not available');
    return user;
  }

  /** An authenticator code (not replayed) or an unused recovery code, which is then spent. */
  private async checkSecondFactor(user: User, code: string): Promise<boolean> {
    const trimmed = code.trim();
    if (/^\d{6}$/.test(trimmed)) {
      if (!user.totpSecret) return false;
      const step = verifyTotp(
        this.secrets.open(user.totpSecret),
        trimmed,
        Date.now(),
        user.totpLastStep,
      );
      return step !== undefined && (await this.repository.useTotpStep(user.id, step));
    }
    const hash = hashRecoveryCode(trimmed);
    if (!user.totpRecoveryHashes.includes(hash)) return false;
    const remaining = user.totpRecoveryHashes.filter((item) => item !== hash);
    return this.repository.useRecoveryCode(user.id, hash, remaining);
  }

  /**
   * Finishes a sign-in whose factors were checked elsewhere: a passkey counts as both (decision
   * 104), so no code is asked. Same session, new-device email and rules as a password sign-in.
   */
  async signInVerified(user: User, client: ClientInfo = {}): Promise<AuthTokens> {
    if (!user.isActive || !user.registeredAt) {
      throw new UnauthorizedException('This passkey cannot sign in');
    }
    return this.signIn(user, client);
  }

  /**
   * A completed sign-in to an existing account (password, or password and code): a new session,
   * and an email when it comes from a browser and system the account hasn't used lately.
   */
  private async signIn(user: User, client: ClientInfo): Promise<AuthTokens> {
    // Read before the new session exists, which would otherwise always match.
    const isNew = await this.isNewDevice(user.id, client.userAgent).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`New-device check failed: ${reason}`);
      return false;
    });
    const tokens = await this.startSession(user, client);
    if (isNew) this.sendNewDeviceEmail(user, client);
    return tokens;
  }

  /** True when the agent names a browser or system and no session of the account matches it. */
  private async isNewDevice(userId: string, userAgent: string | null | undefined) {
    const key = deviceKey(userAgent);
    if (!key) return false;
    const known = await this.repository.listSessionUserAgents(userId);
    return !known.some((agent) => deviceKey(agent) === key);
  }

  private sendNewDeviceEmail(user: User, client: ClientInfo): void {
    const locale = toApiLocale(user.locale);
    const site = this.config.siteUrl;
    const account = this.config.accountUrl;
    const accountUrl = `${account}/${locale}/security`;
    const message = newDeviceSignInEmail(
      user,
      { at: new Date(), ...describeUserAgent(client.userAgent), ip: client.ip ?? null },
      accountUrl,
      `${account}/${locale}/forgot-password`,
      locale,
      site,
    );
    this.mail.send(message).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send new-device sign-in email: ${reason}`);
    });
  }

  /**
   * A new session family for an app's host, from a single sign-on code the account host issued
   * (decision 108). Not an interactive sign-in: no new-device email.
   */
  async startSsoSession(
    user: User,
    sso: SsoSessionInfo,
    client: ClientInfo = {},
  ): Promise<{ tokens: AuthTokens; familyId: string }> {
    const familyId = randomUUID();
    const tokens = await this.startSession(user, client, sso, familyId);
    return { tokens, familyId };
  }

  /** New session family for a completed sign-in. */
  private async startSession(
    user: User,
    client: ClientInfo,
    sso?: SsoSessionInfo,
    familyId: string = randomUUID(),
  ): Promise<AuthTokens> {
    const refreshToken = this.generateRefreshToken();
    await this.repository.createSession(
      this.buildSession(user.id, refreshToken, familyId, client, sso),
    );
    return this.issueTokens(user, refreshToken, familyId);
  }

  private async issueTokens(
    user: User,
    refreshToken: string,
    familyId: string,
  ): Promise<AuthTokens> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sid: familyId,
      ...(user.memberOfId ? { acc: user.memberOfId } : {}),
    };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.jwtAccessTtl,
      user: toAuthUser(user),
    };
  }

  private generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private buildSession(
    userId: string,
    refreshToken: string,
    familyId: string,
    client: ClientInfo,
    sso?: SsoSessionInfo,
  ): CreateSessionData {
    return {
      client: sso?.client ?? null,
      parentFamilyId: sso?.parentFamilyId ?? null,
      id: randomUUID(),
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      familyId,
      expiresAt: new Date(Date.now() + this.config.refreshTokenTtlDays * DAY_MS),
      userAgent: client.userAgent?.slice(0, 512) ?? null,
      ip: client.ip ?? null,
    };
  }
}
