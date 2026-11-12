import { Injectable } from '@nestjs/common';
import type { CloudDeviceCode, CloudToken, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type TokenRow = CloudToken & { team: { slug: string; name: string } | null };
export type TokenOwnerRow = CloudToken & {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'ADMIN' | 'CLIENT';
    isActive: boolean;
    registeredAt: Date | null;
  };
};

/** Cloud's API tokens and CLI sign-ins (architecture 4.13). */
@Injectable()
export class CloudTokensRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<TokenRow[]> {
    return this.prisma.cloudToken.findMany({
      where: { userId },
      include: { team: { select: { slug: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  count(userId: string): Promise<number> {
    return this.prisma.cloudToken.count({ where: { userId } });
  }

  create(data: Prisma.CloudTokenUncheckedCreateInput): Promise<TokenRow> {
    return this.prisma.cloudToken.create({
      data,
      include: { team: { select: { slug: true, name: true } } },
    });
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.cloudToken.deleteMany({ where: { id, userId } });
    return count > 0;
  }

  findByHash(tokenHash: string): Promise<TokenOwnerRow | null> {
    return this.prisma.cloudToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            registeredAt: true,
          },
        },
      },
    });
  }

  async touch(id: string, at: Date, ip: string | null): Promise<void> {
    await this.prisma.cloudToken.update({
      where: { id },
      data: { lastUsedAt: at, lastUsedIp: ip },
    });
  }

  async deleteExpired(now: Date): Promise<number> {
    const { count } = await this.prisma.cloudToken.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    return count;
  }

  // ── Device codes ───────────────────────────────────────────────────────────────────────────

  createDevice(data: Prisma.CloudDeviceCodeUncheckedCreateInput): Promise<CloudDeviceCode> {
    return this.prisma.cloudDeviceCode.create({ data });
  }

  userCodeTaken(userCode: string): Promise<boolean> {
    return this.prisma.cloudDeviceCode.count({ where: { userCode } }).then((n) => n > 0);
  }

  findDeviceByHash(deviceCodeHash: string): Promise<CloudDeviceCode | null> {
    return this.prisma.cloudDeviceCode.findUnique({ where: { deviceCodeHash } });
  }

  findDeviceByUserCode(userCode: string): Promise<CloudDeviceCode | null> {
    return this.prisma.cloudDeviceCode.findUnique({ where: { userCode } });
  }

  /** Records the person's answer once (false when it was already answered). */
  async decide(id: string, userId: string, approve: boolean, now: Date): Promise<boolean> {
    const { count } = await this.prisma.cloudDeviceCode.updateMany({
      where: { id, approvedAt: null, deniedAt: null, expiresAt: { gt: now } },
      data: approve ? { userId, approvedAt: now } : { userId, deniedAt: now },
    });
    return count > 0;
  }

  async polled(id: string, now: Date): Promise<void> {
    await this.prisma.cloudDeviceCode.update({ where: { id }, data: { lastPolledAt: now } });
  }

  /** Hands an approved code's token out once: marks it consumed (false when it already was). */
  async consume(id: string, now: Date): Promise<boolean> {
    const { count } = await this.prisma.cloudDeviceCode.updateMany({
      where: { id, consumedAt: null, approvedAt: { not: null } },
      data: { consumedAt: now },
    });
    return count > 0;
  }

  async deleteDevicesBefore(date: Date): Promise<number> {
    const { count } = await this.prisma.cloudDeviceCode.deleteMany({
      where: { expiresAt: { lt: date } },
    });
    return count;
  }

  async deleteExpiredInvites(before: Date): Promise<number> {
    const { count } = await this.prisma.cloudInvite.deleteMany({
      where: { expiresAt: { lt: before } },
    });
    return count;
  }
}
