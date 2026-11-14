import { Injectable } from '@nestjs/common';
import type {
  CloudBuild,
  CloudBuildStatus,
  CloudEnvVar,
  CloudGitInstallation,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** The most of a build's log kept: the end of it. */
export const LOG_MAX = 1024 * 1024;

const projectForBuild = {
  project: {
    select: {
      id: true,
      slug: true,
      name: true,
      teamId: true,
      gitInstallationId: true,
      gitRepoId: true,
      gitRepo: true,
      rootDir: true,
      installCommand: true,
      buildCommand: true,
      outputDir: true,
      nodeVersion: true,
      deletedAt: true,
      suspendedAt: true,
      team: { select: { slug: true, plan: true } },
    },
  },
} as const;
export type BuildWithProject = Prisma.CloudBuildGetPayload<{ include: typeof projectForBuild }>;

/** What an import did, by name (never values). */
export interface EnvImportOutcome {
  created: string[];
  updated: string[];
  skipped: string[];
}

/** Builds from Git: installations, env vars, builds and GitHub bookkeeping (architecture 4.13). */
@Injectable()
export class CloudBuildsRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ── Installations ──────────────────────────────────────────────────────────────────────────

  installations(teamId: string): Promise<CloudGitInstallation[]> {
    return this.prisma.cloudGitInstallation.findMany({
      where: { teamId },
      orderBy: { createdAt: 'asc' },
    });
  }

  installation(installationId: bigint): Promise<CloudGitInstallation | null> {
    return this.prisma.cloudGitInstallation.findUnique({ where: { installationId } });
  }

  saveInstallation(data: {
    installationId: bigint;
    teamId: string;
    accountLogin: string;
    accountType: string;
    createdById: string;
  }): Promise<CloudGitInstallation> {
    return this.prisma.cloudGitInstallation.upsert({
      where: { installationId: data.installationId },
      create: data,
      update: { accountLogin: data.accountLogin, accountType: data.accountType, suspendedAt: null },
    });
  }

  async removeInstallation(installationId: bigint): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.cloudProject.updateMany({
        where: { gitInstallationId: installationId },
        data: { gitInstallationId: null, gitRepoId: null, gitRepo: null },
      }),
      this.prisma.cloudGitInstallation.deleteMany({ where: { installationId } }),
    ]);
  }

  async suspendInstallation(installationId: bigint, at: Date | null): Promise<void> {
    await this.prisma.cloudGitInstallation.updateMany({
      where: { installationId },
      data: { suspendedAt: at },
    });
  }

  async unlinkRepos(installationId: bigint, repoIds: bigint[]): Promise<void> {
    await this.prisma.cloudProject.updateMany({
      where: { gitInstallationId: installationId, gitRepoId: { in: repoIds } },
      data: { gitInstallationId: null, gitRepoId: null, gitRepo: null },
    });
  }

  /** The live projects a repository is connected to. */
  projectsForRepo(installationId: bigint, repoId: bigint) {
    return this.prisma.cloudProject.findMany({
      where: {
        gitInstallationId: installationId,
        gitRepoId: repoId,
        deletedAt: null,
        suspendedAt: null,
      },
      include: { team: { select: { slug: true, plan: true } } },
    });
  }

  async setGit(projectId: string, data: Prisma.CloudProjectUncheckedUpdateInput): Promise<void> {
    await this.prisma.cloudProject.update({ where: { id: projectId }, data });
  }

  // ── Environment variables ──────────────────────────────────────────────────────────────────

  envVars(projectId: string): Promise<CloudEnvVar[]> {
    return this.prisma.cloudEnvVar.findMany({ where: { projectId }, orderBy: { key: 'asc' } });
  }

  countEnvVars(projectId: string): Promise<number> {
    return this.prisma.cloudEnvVar.count({ where: { projectId } });
  }

  saveEnvVar(
    projectId: string,
    key: string,
    valueSealed: string,
    production: boolean,
    preview: boolean,
  ) {
    return this.prisma.cloudEnvVar.upsert({
      where: { projectId_key: { projectId, key } },
      create: { projectId, key, valueSealed, production, preview },
      update: { valueSealed, production, preview },
    });
  }

  /**
   * Imports many variables at once, all or nothing: new names are created, existing ones replaced
   * only with `overwrite` (otherwise skipped). Nothing is written when the new names would take
   * the project past `limit`: the answer is then the first name over it.
   */
  async importEnvVars(
    projectId: string,
    vars: Array<{ key: string; valueSealed: string }>,
    options: { production: boolean; preview: boolean; overwrite: boolean; limit: number },
  ): Promise<EnvImportOutcome | { overLimit: string }> {
    const { production, preview } = options;
    return this.prisma.$transaction(async (tx) => {
      // Two imports to the same project wait for each other, so both can't pass the limit.
      await tx.$queryRaw`SELECT id FROM cloud_projects WHERE id = ${projectId}::uuid FOR UPDATE`;
      const rows = await tx.cloudEnvVar.findMany({ where: { projectId }, select: { key: true } });
      const existing = new Set(rows.map((row) => row.key));
      const fresh = vars.filter((v) => !existing.has(v.key));
      const room = Math.max(options.limit - existing.size, 0);
      if (fresh.length > room) return { overLimit: fresh[room]!.key };
      if (fresh.length > 0) {
        await tx.cloudEnvVar.createMany({
          data: fresh.map((v) => ({
            projectId,
            key: v.key,
            valueSealed: v.valueSealed,
            production,
            preview,
          })),
        });
      }
      const updated: string[] = [];
      const skipped: string[] = [];
      for (const v of vars) {
        if (!existing.has(v.key)) continue;
        if (!options.overwrite) {
          skipped.push(v.key);
          continue;
        }
        await tx.cloudEnvVar.update({
          where: { projectId_key: { projectId, key: v.key } },
          data: { valueSealed: v.valueSealed, production, preview },
        });
        updated.push(v.key);
      }
      return { created: fresh.map((v) => v.key), updated, skipped };
    });
  }

  async deleteEnvVar(projectId: string, key: string): Promise<boolean> {
    const { count } = await this.prisma.cloudEnvVar.deleteMany({ where: { projectId, key } });
    return count > 0;
  }

  // ── Builds ─────────────────────────────────────────────────────────────────────────────────

  /** A new build with the project's next number (retried once if two race for it). */
  async createBuild(
    data: Omit<Prisma.CloudBuildUncheckedCreateInput, 'number'>,
  ): Promise<CloudBuild> {
    for (let attempt = 0; ; attempt++) {
      const last = await this.prisma.cloudBuild.findFirst({
        where: { projectId: data.projectId },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      try {
        return await this.prisma.cloudBuild.create({
          data: { ...data, number: (last?.number ?? 0) + 1 },
        });
      } catch (error) {
        if (attempt >= 2) throw error;
      }
    }
  }

  /** Queued builds of the same project and branch, older than `before`, are canceled. */
  async cancelSuperseded(projectId: string, branch: string, before: Date): Promise<CloudBuild[]> {
    const rows = await this.prisma.cloudBuild.findMany({
      where: { projectId, branch, status: 'QUEUED', queuedAt: { lt: before } },
    });
    await this.prisma.cloudBuild.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { status: 'CANCELED', finishedAt: before, error: 'A newer commit replaced it' },
    });
    return rows;
  }

  countBuildsSince(teamId: string, since: Date): Promise<number> {
    return this.prisma.cloudBuild.count({
      where: { project: { teamId }, queuedAt: { gte: since }, status: { not: 'CANCELED' } },
    });
  }

  builds(projectId: string, skip: number, take: number) {
    return this.prisma.$transaction([
      this.prisma.cloudBuild.findMany({
        where: { projectId },
        orderBy: { number: 'desc' },
        omit: { log: true },
        skip,
        take,
      }),
      this.prisma.cloudBuild.count({ where: { projectId } }),
    ]);
  }

  findBuild(projectId: string, number: number): Promise<CloudBuild | null> {
    return this.prisma.cloudBuild.findUnique({
      where: { projectId_number: { projectId, number } },
    });
  }

  findById(id: string): Promise<BuildWithProject | null> {
    return this.prisma.cloudBuild.findUnique({ where: { id }, include: projectForBuild });
  }

  update(id: string, data: Prisma.CloudBuildUncheckedUpdateInput): Promise<CloudBuild> {
    return this.prisma.cloudBuild.update({ where: { id }, data });
  }

  /**
   * Claims the oldest queued build whose team has none running (one at a time per team), in a
   * transaction with a lock so two agents never take the same one.
   */
  async claim(builder: string, now: Date): Promise<BuildWithProject | null> {
    const id = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT b.id FROM cloud_builds b
        JOIN cloud_projects p ON p.id = b.project_id
        WHERE b.status = 'QUEUED'
          AND NOT EXISTS (
            SELECT 1 FROM cloud_builds r JOIN cloud_projects rp ON rp.id = r.project_id
            WHERE r.status = 'RUNNING' AND rp.team_id = p.team_id)
        ORDER BY b.queued_at
        LIMIT 1
        FOR UPDATE OF b SKIP LOCKED`;
      const row = rows[0];
      if (!row) return null;
      await tx.cloudBuild.update({
        where: { id: row.id },
        data: { status: 'RUNNING', builder, startedAt: now, heartbeatAt: now },
      });
      return row.id;
    });
    return id ? this.findById(id) : null;
  }

  /** Appends to the log, keeping its last megabyte. */
  async appendLog(id: string, chunk: string): Promise<CloudBuildStatus | null> {
    const rows = await this.prisma.$queryRaw<Array<{ status: CloudBuildStatus }>>`
      UPDATE cloud_builds SET log = right(log || ${chunk}, ${LOG_MAX}), heartbeat_at = now()
      WHERE id = ${id}::uuid RETURNING status`;
    return rows[0]?.status ?? null;
  }

  stale(before: Date): Promise<BuildWithProject[]> {
    return this.prisma.cloudBuild.findMany({
      where: { status: 'RUNNING', heartbeatAt: { lt: before } },
      include: projectForBuild,
      take: 50,
    });
  }

  async cleanup(now: Date): Promise<void> {
    const day = 86_400_000;
    await this.prisma.cloudBuild.updateMany({
      where: { finishedAt: { lt: new Date(now.getTime() - 30 * day) }, log: { not: '' } },
      data: { log: '' },
    });
    await this.prisma.cloudBuild.deleteMany({
      where: { queuedAt: { lt: new Date(now.getTime() - 90 * day) } },
    });
    await this.prisma.cloudGitDelivery.deleteMany({
      where: { receivedAt: { lt: new Date(now.getTime() - day) } },
    });
  }

  // ── GitHub bookkeeping ─────────────────────────────────────────────────────────────────────

  /** Whether a webhook delivery is new (false when it was already handled). */
  async firstDelivery(id: string): Promise<boolean> {
    try {
      await this.prisma.cloudGitDelivery.create({ data: { id } });
      return true;
    } catch {
      return false;
    }
  }

  pullComment(projectId: string, pullRequest: number) {
    return this.prisma.cloudPullComment.findUnique({
      where: { projectId_pullRequest: { projectId, pullRequest } },
    });
  }

  async savePullComment(projectId: string, pullRequest: number, commentId: bigint): Promise<void> {
    await this.prisma.cloudPullComment.upsert({
      where: { projectId_pullRequest: { projectId, pullRequest } },
      create: { projectId, pullRequest, commentId },
      update: { commentId },
    });
  }
}
