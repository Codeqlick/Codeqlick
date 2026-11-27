import { Injectable } from '@nestjs/common';
import type { SsoCode, User } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface CreateSsoCodeData {
  codeHash: string;
  userId: string;
  client: string;
  codeChallenge: string;
  /** A desktop program's loopback redirect; null for a web client. */
  redirectUri: string | null;
  parentFamilyId: string;
  expiresAt: Date;
}

/** Outcome of spending a code: the row and its user, or why it couldn't be spent. */
export type SpentSsoCode =
  | { status: 'spent'; code: SsoCode & { user: User } }
  /** Already exchanged once: the session it gave is revoked by the caller. */
  | { status: 'reused'; code: SsoCode }
  | { status: 'invalid' };

/** Single sign-on codes (architecture 4.3, decision 108). */
@Injectable()
export class SsoRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateSsoCodeData): Promise<void> {
    await this.prisma.ssoCode.create({ data });
  }

  /**
   * Spends the code with this hash for `client` at `now`, atomically: only one caller ever gets
   * `spent` for a code, and only while it is unused and unexpired.
   */
  async spend(codeHash: string, client: string, now: Date): Promise<SpentSsoCode> {
    const code = await this.prisma.ssoCode.findUnique({
      where: { codeHash },
      include: { user: true },
    });
    if (!code || code.client !== client) return { status: 'invalid' };
    if (code.usedAt) return { status: 'reused', code };
    const spent = await this.prisma.ssoCode.updateMany({
      where: { id: code.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (spent.count !== 1) {
      // Expired, or another request spent it a moment ago (then it is a reuse).
      const fresh = await this.prisma.ssoCode.findUnique({ where: { id: code.id } });
      return fresh?.usedAt ? { status: 'reused', code: fresh } : { status: 'invalid' };
    }
    return { status: 'spent', code: { ...code, usedAt: now } };
  }

  /** Records the session family a spent code was exchanged for. */
  async setFamily(id: string, familyId: string): Promise<void> {
    await this.prisma.ssoCode.update({ where: { id }, data: { familyId } });
  }

  /** Deletes codes that expired before `before`. */
  async deleteExpired(before: Date): Promise<number> {
    const result = await this.prisma.ssoCode.deleteMany({ where: { expiresAt: { lt: before } } });
    return result.count;
  }
}
