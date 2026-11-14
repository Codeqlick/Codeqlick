import { Injectable } from '@nestjs/common';
import type { CloudPlan, CloudRole, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CloudMonitorsRepository } from './cloud-monitors.repository.js';
import { keepMembers, sameList, withoutMonitors } from './cloud-transfer.js';
import { CloudRepository } from './cloud.repository.js';

type Db = Prisma.TransactionClient;

export interface TransferTeams {
  projectId: string;
  fromTeamId: string;
  toTeamId: string;
  /** The person moving it. */
  userId: string;
}

/** Everything a move is checked against, read before the transaction and again inside it. */
export interface TransferState {
  project: {
    teamId: string;
    deletedAt: Date | null;
    suspendedAt: Date | null;
    gitRepoId: bigint | null;
  } | null;
  /** The mover's role in the project's (source) team and in the target team. */
  sourceRole: CloudRole | null;
  targetRole: CloudRole | null;
  targetPlan: CloudPlan | null;
  activeBuilds: number;
  targetProjects: number;
  targetStorageBytes: number;
  projectStorageBytes: number;
  targetMonitors: number;
  /** The source team's monitors tied to the project. */
  monitors: Array<{ id: string; alertIds: string[] }>;
}

export interface TransferWrite extends TransferTeams {
  /** Keep the link through this installation of the target, clear it, or there is none. */
  git: { installationId: bigint } | 'drop' | 'none';
  /** The current Madrid month's start: its analytics events move inside the transaction. */
  monthStart: Date;
}

/** Moving a project to another team (architecture 4.13, decision 58). */
@Injectable()
export class CloudTransferRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloud: CloudRepository,
    private readonly monitors: CloudMonitorsRepository,
  ) {}

  async state(input: TransferTeams, db: Db = this.prisma): Promise<TransferState> {
    const project = await db.cloudProject.findUnique({
      where: { id: input.projectId },
      select: { teamId: true, deletedAt: true, suspendedAt: true, gitRepoId: true },
    });
    const role = async (teamId: string) =>
      (
        await db.cloudMember.findUnique({
          where: { teamId_userId: { teamId, userId: input.userId } },
          select: { role: true },
        })
      )?.role ?? null;
    const sourceRole = await role(input.fromTeamId);
    const targetRole = await role(input.toTeamId);
    const target = await db.cloudTeam.findUnique({
      where: { id: input.toTeamId },
      select: { plan: true },
    });
    const activeBuilds = await db.cloudBuild.count({
      where: { projectId: input.projectId, status: { in: ['QUEUED', 'RUNNING'] } },
    });
    const targetProjects = await this.cloud.countProjects(input.toTeamId, db);
    const targetStorageBytes = await this.cloud.storageBytes(input.toTeamId, db);
    const projectSize = await db.cloudDeployment.aggregate({
      where: { projectId: input.projectId },
      _sum: { sizeBytes: true },
    });
    const targetMonitors = await this.monitors.count(input.toTeamId, db);
    const monitors = await db.cloudMonitor.findMany({
      where: { teamId: input.fromTeamId, projectId: input.projectId },
      select: { id: true, alertIds: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      project,
      sourceRole,
      targetRole,
      targetPlan: target?.plan ?? null,
      activeBuilds,
      targetProjects,
      targetStorageBytes,
      projectStorageBytes: Number(projectSize._sum.sizeBytes ?? 0n),
      targetMonitors,
      monitors,
    };
  }

  /**
   * Moves the project in one transaction: the teams' and the project's rows are locked, the state
   * read again and handed to `check` (which throws to refuse), then every row that names the team
   * or its people is rewritten. Returns how many monitors moved.
   */
  transfer(input: TransferWrite, check: (state: TransferState) => void): Promise<number> {
    return this.prisma.$transaction(
      async (tx) => {
        const teamIds = [input.fromTeamId, input.toTeamId];
        await tx.$queryRaw`
          SELECT id FROM cloud_teams WHERE id = ANY(${teamIds}::uuid[]) ORDER BY id FOR UPDATE`;
        await tx.$queryRaw`
          SELECT id FROM cloud_projects WHERE id = ${input.projectId}::uuid FOR UPDATE`;
        const state = await this.state(input, tx);
        check(state);

        const members = new Set(
          (
            await tx.cloudMember.findMany({
              where: { teamId: input.toTeamId },
              select: { userId: true },
            })
          ).map((m) => m.userId),
        );
        const people = (ids: string[]) => keepMembers(ids, members, input.userId);

        await tx.cloudProject.update({
          where: { id: input.projectId },
          data: {
            teamId: input.toTeamId,
            ...(input.git === 'drop'
              ? { gitInstallationId: null, gitRepoId: null, gitRepo: null }
              : input.git === 'none'
                ? {}
                : { gitInstallationId: input.git.installationId }),
          },
        });

        // Monitors tied to the project, with their checks, events and heartbeat URLs.
        for (const monitor of state.monitors) {
          await tx.cloudMonitor.update({
            where: { id: monitor.id },
            data: { teamId: input.toTeamId, alertIds: people(monitor.alertIds) },
          });
        }
        if (state.monitors.length > 0) {
          const page = await tx.cloudStatusPage.findUnique({
            where: { teamId: input.fromTeamId },
            select: { items: true },
          });
          const items = page
            ? withoutMonitors(page.items, new Set(state.monitors.map((m) => m.id)))
            : null;
          if (items) {
            await tx.cloudStatusPage.update({
              where: { teamId: input.fromTeamId },
              data: { items: items as Prisma.InputJsonValue },
            });
          }
        }

        for (const form of await tx.cloudForm.findMany({
          where: { projectId: input.projectId },
          select: { id: true, recipientIds: true },
        })) {
          const recipientIds = people(form.recipientIds);
          if (!sameList(recipientIds, form.recipientIds)) {
            await tx.cloudForm.update({ where: { id: form.id }, data: { recipientIds } });
          }
        }
        for (const channel of await tx.cloudNotifyChannel.findMany({
          where: { projectId: input.projectId, kind: 'EMAIL' },
          select: { id: true, recipientIds: true },
        })) {
          const recipientIds = people(channel.recipientIds);
          if (!sameList(recipientIds, channel.recipientIds)) {
            await tx.cloudNotifyChannel.update({
              where: { id: channel.id },
              data: { recipientIds },
            });
          }
        }

        // This month's events count against the target's analytics limit at once.
        await tx.cloudAnalyticsEvent.updateMany({
          where: { projectId: input.projectId, createdAt: { gte: input.monthStart } },
          data: { teamId: input.toTeamId },
        });
        return state.monitors.length;
      },
      // Locks are waited for, and a busy month of analytics takes a while to rewrite.
      { maxWait: 10_000, timeout: 60_000 },
    );
  }

  /**
   * Rewrites up to `batch` of the project's analytics events still naming another team, while
   * the project is in `teamId` (a later move takes over).
   */
  moveAnalyticsBatch(projectId: string, teamId: string, batch: number): Promise<number> {
    return this.prisma.$executeRaw`
      UPDATE cloud_analytics_events SET team_id = ${teamId}::uuid
      WHERE id IN (
        SELECT e.id FROM cloud_analytics_events e
        JOIN cloud_projects p ON p.id = e.project_id
        WHERE e.project_id = ${projectId}::uuid AND p.team_id = ${teamId}::uuid
          AND e.team_id <> ${teamId}::uuid
        LIMIT ${batch}
      )`;
  }
}
