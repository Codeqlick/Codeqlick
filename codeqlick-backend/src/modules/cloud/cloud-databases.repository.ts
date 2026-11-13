import { Injectable } from '@nestjs/common';
import type { CloudDatabase, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export type DatabaseWithTeam = CloudDatabase & {
  project: {
    slug: string;
    name: string;
    teamId: string;
    team: { slug: string; name: string; plan: 'FREE' | 'PRO' };
  };
};

/** Projects' managed databases (architecture 4.13 "Databases", decision 47). */
@Injectable()
export class CloudDatabasesRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(projectId: string): Promise<CloudDatabase[]> {
    return this.prisma.cloudDatabase.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
  }

  count(projectId: string): Promise<number> {
    return this.prisma.cloudDatabase.count({ where: { projectId } });
  }

  find(projectId: string, id: string): Promise<CloudDatabase | null> {
    return this.prisma.cloudDatabase.findFirst({ where: { id, projectId } });
  }

  create(data: Prisma.CloudDatabaseUncheckedCreateInput): Promise<CloudDatabase> {
    return this.prisma.cloudDatabase.create({ data });
  }

  update(id: string, data: Prisma.CloudDatabaseUpdateInput): Promise<CloudDatabase> {
    return this.prisma.cloudDatabase.update({ where: { id }, data });
  }

  delete(id: string): Promise<unknown> {
    return this.prisma.cloudDatabase.delete({ where: { id } });
  }

  /** Every database's last measured size, across Cloud. */
  async totalBytes(): Promise<number> {
    const sum = await this.prisma.cloudDatabase.aggregate({ _sum: { sizeBytes: true } });
    return Number(sum._sum.sizeBytes ?? 0n);
  }

  /** Every database, with its team's plan (for the size check). */
  all(): Promise<DatabaseWithTeam[]> {
    return this.prisma.cloudDatabase.findMany({
      include: {
        project: {
          select: {
            slug: true,
            name: true,
            teamId: true,
            team: { select: { slug: true, name: true, plan: true } },
          },
        },
      },
    });
  }

  /** Databases whose project is gone (deleted projects keep their row 30 days). */
  orphans(): Promise<CloudDatabase[]> {
    return this.prisma.cloudDatabase.findMany({ where: { project: { deletedAt: { not: null } } } });
  }

  admins(teamId: string) {
    return this.prisma.user.findMany({
      where: {
        isActive: true,
        cloudMemberships: { some: { teamId, role: { in: ['OWNER', 'ADMIN'] } } },
      },
      select: { email: true, locale: true },
    });
  }
}
