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
import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import type { AccessTokenPayload, AuthUser } from '../../common/types/auth-user.js';
import type { User } from '../../generated/prisma/client.js';
import { AuthRepository, type CreateSessionData } from './auth.repository.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService } from '../mail/mail.service.js';
import { invitationEmail, passwordResetEmail } from './auth-emails.js';
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
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a password reset link works. */
export const PASSWORD_RESET_TTL_MINUTES = 60;

/** How long the set-your-password link of a welcome email works. */
export const INVITATION_TTL_DAYS = 7;

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function toAuthUser(
  user: Pick<User, 'id' | 'email' | 'name' | 'role'> & { memberOfId?: string | null },
): AuthUser {
  const base: AuthUser = { id: user.id, email: user.email, name: user.name, role: user.role };
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
    if (!valid || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.totpEnabledAt) {
      const challengeToken = await this.jwt.signAsync(
        { sub: user.id, purpose: '2fa' },
        { secret: this.challengeKey, expiresIn: CHALLENGE_TTL_SECONDS },
      );
      return { twoFactorRequired: true, challengeToken };
    }

    return this.startSession(user, client);
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
    const next = this.buildSession(session.userId, nextToken, session.familyId, client);
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

  /** The caller's own email preferences. */
  async preferences(userId: string): Promise<Preferences> {
    const user = await this.activeUser(userId);
    return { weeklyDigest: user.weeklyDigest, monthlyReport: user.monthlyReport };
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

    const token = this.generateRefreshToken();
    await this.repository.replacePasswordResetToken(
      user.id,
      hashRefreshToken(token),
      new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000),
    );

    const link = `${this.config.siteUrl}/${locale}/reset-password?token=${token}`;
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
    const link = `${this.config.siteUrl}/${locale}/reset-password?token=${token}&welcome=1`;
    await this.mail.send(
      invitationEmail(user, link, locale, INVITATION_TTL_DAYS, this.config.siteUrl),
    );
  }

  /** Sets a new password with the token from the email and signs the user out everywhere. */
  async confirmPasswordReset(token: string, newPassword: string): Promise<void> {
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

    return this.startSession(user, client);
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

  /** New session family for a completed sign-in. */
  private async startSession(user: User, client: ClientInfo): Promise<AuthTokens> {
    const refreshToken = this.generateRefreshToken();
    const familyId = randomUUID();
    await this.repository.createSession(this.buildSession(user.id, refreshToken, familyId, client));
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
  ): CreateSessionData {
    return {
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
