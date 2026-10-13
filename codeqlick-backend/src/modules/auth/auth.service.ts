import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service.js';
import type { AccessTokenPayload, AuthUser } from '../../common/types/auth-user.js';
import type { User } from '../../generated/prisma/client.js';
import { AuthRepository, type CreateSessionData } from './auth.repository.js';
import { PasswordService } from './password.service.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface ClientInfo {
  userAgent?: string | null;
  ip?: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function toAuthUser(user: Pick<User, 'id' | 'email' | 'name' | 'role'>): AuthUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly repository: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async login(email: string, password: string, client: ClientInfo = {}): Promise<AuthTokens> {
    const user = await this.repository.findUserByEmail(email.trim().toLowerCase());
    if (!user) {
      await this.passwords.verifyDummy(password);
      throw new UnauthorizedException('Invalid email or password');
    }
    const valid = await this.passwords.verify(user.passwordHash, password);
    if (!valid || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const refreshToken = this.generateRefreshToken();
    await this.repository.createSession(
      this.buildSession(user.id, refreshToken, randomUUID(), client),
    );
    return this.issueTokens(user, refreshToken);
  }

  async refresh(refreshToken: string, client: ClientInfo = {}): Promise<AuthTokens> {
    const session = await this.repository.findSessionByTokenHash(hashRefreshToken(refreshToken));
    if (!session) throw new UnauthorizedException('Invalid refresh token');

    if (session.revokedAt) {
      // An already-rotated (or revoked) token came back: assume theft, kill the family.
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
    return this.issueTokens(session.user, nextToken);
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    const session = await this.repository.findSessionByTokenHash(hashRefreshToken(refreshToken));
    if (session && session.userId === userId) {
      await this.repository.revokeSession(session.id);
    }
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.repository.findUserById(userId);
    if (!user || !user.isActive) throw new UnauthorizedException('Account not available');
    return toAuthUser(user);
  }

  private async issueTokens(user: User, refreshToken: string): Promise<AuthTokens> {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
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
