import { Injectable } from '@nestjs/common';
import type { Session, User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface CreateSessionData {
  id: string;
  userId: string;
  tokenHash: string;
  familyId: string;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
}

export type SessionWithUser = Session & { user: User };

/** Persistence for users (read side) and refresh-token sessions. */
@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async createSession(data: CreateSessionData): Promise<void> {
    await this.prisma.session.create({ data });
  }

  findSessionByTokenHash(tokenHash: string): Promise<SessionWithUser | null> {
    return this.prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
  }

  /**
   * Atomically revokes `oldSessionId` (only if still active) and creates its replacement.
   * Returns false when the old session had already been revoked (concurrent refresh).
   */
  async rotateSession(oldSessionId: string, next: CreateSessionData): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({
        where: { id: oldSessionId, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: next.id },
      });
      if (revoked.count !== 1) return false;
      await tx.session.create({ data: next });
      return true;
    });
  }

  async revokeSession(id: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Stores the new password hash and revokes the user's active sessions, except the one whose
   * refresh token hash is `keepTokenHash`.
   */
  async changePassword(userId: string, passwordHash: string, keepTokenHash: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null, tokenHash: { not: keepTokenHash } },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /** Replaces any unused reset token of the user with a new one: only the latest link works. */
  async replacePasswordResetToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({ where: { userId, usedAt: null } }),
      this.prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } }),
    ]);
  }

  /**
   * Spends a reset token: marks it used (only if unused and not expired), stores the new password
   * hash and revokes every session of the user. Returns false when the token can't be used.
   */
  async resetPassword(tokenHash: string, hashPassword: () => Promise<string>): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const token = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!token || !token.user.isActive) return false;
      // Conditional update: two requests with the same token can't both win.
      const spent = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (spent.count !== 1) return false;

      await tx.user.update({
        where: { id: token.userId },
        data: { passwordHash: await hashPassword() },
      });
      await tx.session.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return true;
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
