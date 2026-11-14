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
  /**
   * Keep the link through this installation of the target (with the repository's current name),
   * clear it, or there is none.
   */
  git: { installationId: bigint; repo: string } | 'drop' | 'none';
}

/** Where a run of analytics batches has got to: the last event moved (by time, then id). */
export interface AnalyticsCursor {
  at: Date;
  id: bigint;
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
                : { gitInstallationId: input.git.installationId, gitRepo: input.git.repo }),
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
        // Analytics events move after the commit, in batches (moveAnalyticsBatch).
        return state.monitors.length;
      },
      // The teams' rows may be locked by another move for a moment.
      { maxWait: 10_000, timeout: 15_000 },
    );
  }

  /**
   * Rewrites the next `size` of the project's analytics events created in [after.at, before) that
   * still name another team, walking `(created_at, id)` from the cursor through the
   * `(project_id, created_at)` index so no batch scans the ones before it. Nothing is rewritten
   * once the project is no longer in `teamId` (a later move takes over): then `moved` is 0 while
   * `last` is not null. `last` null means the window is done.
   */
  async moveAnalyticsBatch(
    projectId: string,
    teamId: string,
    after: AnalyticsCursor,
    before: Date,
    size: number,
  ): Promise<{ moved: number; last: AnalyticsCursor | null }> {
    const [row] = await this.prisma.$queryRaw<
      Array<{ moved: number; at: Date | null; id: bigint | null }>
    >`
      WITH batch AS (
        SELECT e.id, e.created_at FROM cloud_analytics_events e
        WHERE e.project_id = ${projectId}::uuid AND e.team_id <> ${teamId}::uuid
          AND e.created_at >= ${after.at}::timestamptz AND e.created_at < ${before}::timestamptz
          AND (e.created_at, e.id) > (${after.at}::timestamptz, ${after.id}::bigint)
        ORDER BY e.created_at, e.id
        LIMIT ${size}
      ), moved AS (
        UPDATE cloud_analytics_events SET team_id = ${teamId}::uuid
        WHERE id IN (SELECT id FROM batch)
          AND EXISTS (
            SELECT 1 FROM cloud_projects WHERE id = ${projectId}::uuid AND team_id = ${teamId}::uuid
          )
        RETURNING id
      ), last AS (
        SELECT id, created_at FROM batch ORDER BY created_at DESC, id DESC LIMIT 1
      )
      SELECT (SELECT count(*) FROM moved)::int AS moved,
             (SELECT created_at FROM last) AS at,
             (SELECT id FROM last) AS id`;
    return {
      moved: row?.moved ?? 0,
      last: row?.at && row.id !== null ? { at: row.at, id: row.id } : null,
    };
  }
}
