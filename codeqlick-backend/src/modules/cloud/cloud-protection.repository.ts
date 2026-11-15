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
  protectionUpdatedAt: Date | null;
  /** The bypass token for automation (decision 78): only its SHA-256 hex is kept. */
  protectionBypassHash: string | null;
  protectionBypassPrefix: string | null;
  protectionBypassCreatedAt: Date | null;
  protectionBypassCreatedBy: { id: string; name: string } | null;
  protectionBypassLastUsedAt: Date | null;
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
  protectionUpdatedAt: true,
  protectionBypassHash: true,
  protectionBypassPrefix: true,
  protectionBypassCreatedAt: true,
  protectionBypassCreatedBy: { select: { id: true, name: true } },
  protectionBypassLastUsedAt: true,
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

  /** A live project by its id. */
  findById(id: string): Promise<ProtectedProject | null> {
    return this.prisma.cloudProject.findFirst({
      where: { id, deletedAt: null },
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
  ): Promise<ProtectedProject> {
    return this.prisma.cloudProject.update({ where: { id }, data, select: protectedSelect });
  }

  /** Stores a new bypass token's hash, replacing the previous one (and its last use). */
  setBypass(
    id: string,
    data: { hash: string; prefix: string; createdAt: Date; createdById: string },
  ): Promise<ProtectedProject> {
    return this.prisma.cloudProject.update({
      where: { id },
      data: {
        protectionBypassHash: data.hash,
        protectionBypassPrefix: data.prefix,
        protectionBypassCreatedAt: data.createdAt,
        protectionBypassCreatedById: data.createdById,
        protectionBypassLastUsedAt: null,
      },
      select: protectedSelect,
    });
  }

  /** Removes the bypass token. */
  async clearBypass(id: string): Promise<void> {
    await this.prisma.cloudProject.update({
      where: { id },
      data: {
        protectionBypassHash: null,
        protectionBypassPrefix: null,
        protectionBypassCreatedAt: null,
        protectionBypassCreatedById: null,
        protectionBypassLastUsedAt: null,
      },
    });
  }

  /** Stamps the token's last use, only while it is still the project's current one. */
  async touchBypass(id: string, hash: string, at: Date): Promise<void> {
    await this.prisma.cloudProject.updateMany({
      where: { id, protectionBypassHash: hash },
      data: { protectionBypassLastUsedAt: at },
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
