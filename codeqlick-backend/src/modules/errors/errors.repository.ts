import { Injectable } from '@nestjs/common';
import type { ErrorGroup, ErrorSource } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface ErrorOccurrence {
  fingerprint: string;
  source: ErrorSource;
  message: string;
  stack: string | null;
  method: string | null;
  path: string | null;
  reference: string | null;
  userAgent: string | null;
}

@Injectable()
export class ErrorsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByFingerprint(fingerprint: string): Promise<ErrorGroup | null> {
    return this.prisma.errorGroup.findUnique({ where: { fingerprint } });
  }

  countOpen(): Promise<number> {
    return this.prisma.errorGroup.count({ where: { resolvedAt: null } });
  }

  /** One more occurrence: creates the group or counts it, reopening it when it was resolved. */
  record(occurrence: ErrorOccurrence, now: Date): Promise<ErrorGroup> {
    const { fingerprint, ...last } = occurrence;
    return this.prisma.errorGroup.upsert({
      where: { fingerprint },
      create: { ...occurrence, firstSeenAt: now, lastSeenAt: now },
      update: {
        stack: last.stack,
        method: last.method,
        path: last.path,
        reference: last.reference,
        userAgent: last.userAgent,
        count: { increment: 1 },
        lastSeenAt: now,
        resolvedAt: null,
      },
    });
  }

  list(resolved: boolean): Promise<ErrorGroup[]> {
    return this.prisma.errorGroup.findMany({
      where: { resolvedAt: resolved ? { not: null } : null },
      orderBy: { lastSeenAt: 'desc' },
      take: 200,
    });
  }

  findById(id: string): Promise<ErrorGroup | null> {
    return this.prisma.errorGroup.findUnique({ where: { id } });
  }

  setResolved(id: string, resolvedAt: Date | null): Promise<ErrorGroup> {
    return this.prisma.errorGroup.update({ where: { id }, data: { resolvedAt } });
  }

  async resolveAll(now: Date): Promise<number> {
    const { count } = await this.prisma.errorGroup.updateMany({
      where: { resolvedAt: null },
      data: { resolvedAt: now },
    });
    return count;
  }

  /** Resolved groups that haven't come back since `before`. */
  async deleteResolvedBefore(before: Date): Promise<number> {
    const { count } = await this.prisma.errorGroup.deleteMany({
      where: { resolvedAt: { lt: before }, lastSeenAt: { lt: before } },
    });
    return count;
  }
}
