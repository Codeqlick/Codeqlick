import { Injectable } from '@nestjs/common';
import type { CloudProtection } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** What the hosting sites' checks need of a project. */
export interface ProtectedProject {
  id: string;
  slug: string;
  name: string;
  protection: CloudProtection;
  protectionHash: string | null;
  protectionDays: number;
  protectionVersion: number;
  suspendedAt: Date | null;
}

const protectedSelect = {
  id: true,
  slug: true,
  name: true,
  protection: true,
  protectionHash: true,
  protectionDays: true,
  protectionVersion: true,
  suspendedAt: true,
} as const;

/** Projects' password protection (architecture 4.13 "Password protection", decision 50). */
@Injectable()
export class CloudProtectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** A live project by its slug (what the hosting site sends). */
  findBySlug(slug: string): Promise<ProtectedProject | null> {
    return this.prisma.cloudProject.findFirst({
      where: { slug, deletedAt: null },
      select: protectedSelect,
    });
  }

  update(
    id: string,
    data: {
      protection: CloudProtection;
      protectionHash: string | null;
      protectionDays: number;
      protectionVersion: number;
      protectionUpdatedAt: Date;
    },
  ): Promise<ProtectedProject & { protectionUpdatedAt: Date | null }> {
    return this.prisma.cloudProject.update({
      where: { id },
      data,
      select: { ...protectedSelect, protectionUpdatedAt: true },
    });
  }

  /** A deployment's stored `codeqlick.json` rules; null when it doesn't exist (yet). */
  deploymentConfig(id: string): Promise<{ config: unknown } | null> {
    return this.prisma.cloudDeployment.findUnique({ where: { id }, select: { config: true } });
  }

  hasDeployment(projectId: string, shortId: string): Promise<boolean> {
    return this.prisma.cloudDeployment.count({ where: { projectId, shortId } }).then((n) => n > 0);
  }
}
