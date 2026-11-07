import { Injectable } from '@nestjs/common';
import type { Prisma, Session, User } from '../../generated/prisma/client.js';
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

  setPreferences(id: string, data: { weeklyDigest?: boolean; monthlyReport?: boolean }) {
    return this.prisma.user.update({
      where: { id },
      data,
      select: { weeklyDigest: true, monthlyReport: true },
    });
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

  /** A self-registration to confirm, replacing earlier unconfirmed ones for the email. */
  async createSignupToken(data: Prisma.SignupTokenCreateInput): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.signupToken.deleteMany({ where: { email: data.email, usedAt: null } }),
      this.prisma.signupToken.create({ data }),
    ]);
  }

  /**
   * Spends a sign-up token: the email's account is created, or the unregistered one the team
   * prepared becomes theirs. Null when the token can't be used or the email is registered already.
   */
  async confirmSignup(tokenHash: string): Promise<User | null> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const token = await tx.signupToken.findUnique({ where: { tokenHash } });
      if (!token) return null;
      const spent = await tx.signupToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (spent.count !== 1) return null;
      const existing = await tx.user.findUnique({ where: { email: token.email } });
      const own = { name: token.name, passwordHash: token.passwordHash, locale: token.locale };
      if (!existing) {
        return tx.user.create({
          data: { ...own, email: token.email, role: 'CLIENT', registeredAt: now },
        });
      }
      if (existing.registeredAt || !existing.isActive) return null;
      return tx.user.update({ where: { id: existing.id }, data: { ...own, registeredAt: now } });
    });
  }

  /** The unregistered account an invitation token is for, while it can be used. */
  async findInvitation(tokenHash: string) {
    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!token || token.usedAt || token.expiresAt <= new Date()) return null;
    if (token.user.registeredAt || !token.user.isActive) return null;
    return token.user;
  }

  /** Spends an invitation token: the account becomes theirs with the name and password chosen. */
  async acceptInvitation(
    tokenHash: string,
    data: { name: string; passwordHash: string; locale: Prisma.UserUpdateInput['locale'] },
  ): Promise<User | null> {
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const token = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!token || token.user.registeredAt || !token.user.isActive) return null;
      const spent = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (spent.count !== 1) return null;
      return tx.user.update({ where: { id: token.userId }, data: { ...data, registeredAt: now } });
    });
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
        // The emailed link proves the address: an unregistered account becomes theirs.
        data: { passwordHash: await hashPassword(), registeredAt: token.user.registeredAt ?? now },
      });
      await tx.session.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      return true;
    });
  }

  /** Stores a new, not yet confirmed, authenticator secret (replacing an unconfirmed one). */
  async setPendingTotp(userId: string, sealedSecret: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: sealedSecret,
        totpEnabledAt: null,
        totpLastStep: null,
        totpRecoveryHashes: [],
      },
    });
  }

  async enableTotp(userId: string, step: number, recoveryHashes: string[]): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabledAt: new Date(), totpLastStep: step, totpRecoveryHashes: recoveryHashes },
    });
  }

  async disableTotp(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpRecoveryHashes: [] },
    });
  }

  /** Records `step` as used. False when it (or a later one) already was: a replayed code. */
  async useTotpStep(userId: string, step: number): Promise<boolean> {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
      data: { totpLastStep: step },
    });
    return result.count === 1;
  }

  /** Removes a recovery code. False when the user doesn't have it (anymore). */
  async useRecoveryCode(userId: string, hash: string, remaining: string[]): Promise<boolean> {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, totpRecoveryHashes: { has: hash } },
      data: { totpRecoveryHashes: remaining },
    });
    return result.count === 1;
  }

  /** The user's live sessions: one row per family (the latest rotation), newest first. */
  listActiveSessions(userId: string, now: Date): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Signs out one of the user's sessions. Returns false when it isn't theirs or already ended. */
  async revokeUserFamily(userId: string, familyId: string): Promise<boolean> {
    const result = await this.prisma.session.updateMany({
      where: { userId, familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return result.count > 0;
  }

  /** Signs out every session of the user except the family `keepFamilyId`. */
  async revokeOtherFamilies(userId: string, keepFamilyId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null, familyId: { not: keepFamilyId } },
      data: { revokedAt: new Date() },
    });
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Deletes sessions, password reset and sign-up tokens that expired before `before`. */
  async deleteExpired(before: Date): Promise<{ sessions: number; resetTokens: number }> {
    const [sessions, resetTokens, signups] = await this.prisma.$transaction([
      this.prisma.session.deleteMany({ where: { expiresAt: { lt: before } } }),
      this.prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: before } } }),
      this.prisma.signupToken.deleteMany({ where: { expiresAt: { lt: before } } }),
    ]);
    return { sessions: sessions.count, resetTokens: resetTokens.count + signups.count };
  }
}
