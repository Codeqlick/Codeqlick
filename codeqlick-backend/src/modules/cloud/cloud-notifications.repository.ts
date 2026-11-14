import { Injectable } from '@nestjs/common';
import type { CloudNotifyChannel, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Build notification channels (architecture 4.13 "Build notifications", decisions 43 and 63). */
@Injectable()
export class CloudNotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list(projectId: string): Promise<CloudNotifyChannel[]> {
    return this.prisma.cloudNotifyChannel.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
    });
  }

  count(projectId: string): Promise<number> {
    return this.prisma.cloudNotifyChannel.count({ where: { projectId } });
  }

  find(projectId: string, id: string): Promise<CloudNotifyChannel | null> {
    return this.prisma.cloudNotifyChannel.findFirst({ where: { id, projectId } });
  }

  create(data: Prisma.CloudNotifyChannelUncheckedCreateInput): Promise<CloudNotifyChannel> {
    return this.prisma.cloudNotifyChannel.create({ data });
  }

  update(
    id: string,
    data: Prisma.CloudNotifyChannelUncheckedUpdateInput,
  ): Promise<CloudNotifyChannel> {
    return this.prisma.cloudNotifyChannel.update({ where: { id }, data });
  }

  async delete(projectId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.cloudNotifyChannel.deleteMany({ where: { id, projectId } });
    return count > 0;
  }

  /** Records a failed delivery; returns the failures in a row now. */
  async failed(id: string, error: string, at: Date): Promise<number> {
    const row = await this.prisma.cloudNotifyChannel.update({
      where: { id },
      data: { failures: { increment: 1 }, lastSentAt: at, lastOk: false, lastError: error },
      select: { failures: true },
    });
    return row.failures;
  }

  async succeeded(id: string, at: Date): Promise<void> {
    await this.prisma.cloudNotifyChannel.update({
      where: { id },
      data: { failures: 0, lastSentAt: at, lastOk: true, lastError: null },
    });
  }

  /** Switches a channel off unless it already is; true when this call did it. */
  async switchOff(id: string): Promise<boolean> {
    const { count } = await this.prisma.cloudNotifyChannel.updateMany({
      where: { id, enabled: true },
      data: { enabled: false },
    });
    return count > 0;
  }

  /** A finished build with what its messages need. */
  build(id: string) {
    return this.prisma.cloudBuild.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        target: true,
        branch: true,
        commit: true,
        commitMessage: true,
        author: true,
        pullRequest: true,
        status: true,
        error: true,
        startedAt: true,
        finishedAt: true,
        project: {
          select: {
            id: true,
            slug: true,
            name: true,
            teamId: true,
            team: { select: { slug: true, name: true } },
          },
        },
      },
    });
  }

  /** Which of `formIds` are forms of the project (decision 63). */
  async formsAmong(projectId: string, formIds: string[]): Promise<string[]> {
    const rows = await this.prisma.cloudForm.findMany({
      where: { projectId, id: { in: formIds } },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  /** Which of `userIds` are members of the team. */
  async membersAmong(teamId: string, userIds: string[]): Promise<string[]> {
    const rows = await this.prisma.cloudMember.findMany({
      where: { teamId, userId: { in: userIds } },
      select: { userId: true },
    });
    return rows.map((row) => row.userId);
  }

  /** Active members among `userIds`, with what an email needs. */
  recipients(teamId: string, userIds: string[]) {
    return this.prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true, cloudMemberships: { some: { teamId } } },
      select: { email: true, locale: true },
    });
  }

  /** The team's owners and admins. */
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
