import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CloudCtx } from './cloud-caller.js';
import {
  DELETED_PROJECT_DAYS,
  EVENTS_DAYS,
  KEPT_DEPLOYMENTS,
  RESERVED_SLUGS,
} from './cloud-plans.js';
import { CloudRepository, type DeploymentRow, type ProjectRow } from './cloud.repository.js';
import type { CreateProjectInput, DeploymentFields, UpdateProjectInput } from './cloud.schemas.js';
import {
  branchLabel,
  BundleError,
  CloudStorage,
  deploymentLabel,
  productionLabel,
} from './cloud.storage.js';
import { CloudDiskService } from './cloud-disk.service.js';
import { CloudTeamsService } from './cloud-teams.service.js';
import { CloudTokensService } from './cloud-tokens.service.js';

export interface DeploymentView {
  id: string;
  shortId: string;
  url: string;
  /** The branch's fixed address, while this is the newest preview of its branch. */
  branchUrl: string | null;
  target: 'preview' | 'production';
  isProduction: boolean;
  message: string | null;
  commit: string | null;
  branch: string | null;
  sizeBytes: number;
  fileCount: number;
  createdBy: { id: string; name: string } | null;
  viaToken: string | null;
  createdAt: string;
}

export interface ProjectView {
  id: string;
  slug: string;
  name: string;
  team: { slug: string; name: string };
  url: string;
  production: DeploymentView | null;
  domains: Array<{ name: string; state: 'PENDING' | 'VERIFIED' | 'LIVE' | 'ERROR' }>;
  suspended: { at: string; reason: string } | null;
  createdAt: string;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

/** Cloud projects and their static deployments (architecture 4.13). */
@Injectable()
export class CloudProjectsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CloudProjectsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly repository: CloudRepository,
    private readonly teams: CloudTeamsService,
    private readonly tokens: CloudTokensService,
    private readonly storage: CloudStorage,
    private readonly config: AppConfigService,
    private readonly disk: CloudDiskService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.housekeeping(), HOUR_MS).unref();
    void this.housekeeping();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ── Addresses ──────────────────────────────────────────────────────────────────────────────

  private domain(): string {
    return this.config.cloudHosting?.domain ?? 'codeqlick.app';
  }

  projectUrl(slug: string): string {
    return `https://${productionLabel(slug)}.${this.domain()}`;
  }

  deploymentUrl(slug: string, shortId: string): string {
    return `https://${deploymentLabel(slug, shortId)}.${this.domain()}`;
  }

  branchUrl(slug: string, branch: string): string {
    return `https://${branchLabel(slug, branch)}.${this.domain()}`;
  }

  // ── Projects ───────────────────────────────────────────────────────────────────────────────

  /** The project if the caller may see it (its team's member, through an allowed token). */
  async project(ctx: CloudCtx, id: string, min: 'MEMBER' | 'ADMIN' | 'OWNER' = 'MEMBER') {
    const project = await this.repository.findProject(id);
    if (!project) throw new NotFoundException('Project not found');
    const membership = await this.teams.accessById(ctx, project.teamId, min);
    return { project, membership };
  }

  /** A live project's row, without access checks (for builds, which run as Cloud itself). */
  projectRow(id: string): Promise<ProjectRow | null> {
    return this.repository.findProject(id);
  }

  async list(ctx: CloudCtx, teamSlug: string): Promise<ProjectView[]> {
    const membership = await this.teams.access(ctx, teamSlug);
    return (await this.repository.projects(membership.teamId)).map((p) => this.view(p));
  }

  async get(ctx: CloudCtx, id: string): Promise<ProjectView> {
    return this.viewWithBranch((await this.project(ctx, id)).project);
  }

  async create(ctx: CloudCtx, teamSlug: string, input: CreateProjectInput): Promise<ProjectView> {
    const membership = await this.teams.access(ctx, teamSlug, 'ADMIN');
    if (RESERVED_SLUGS.has(input.slug) || input.slug.startsWith('xn--')) {
      throw new ConflictException('That address is reserved');
    }
    const limits = this.teams.limits(membership.team.plan);
    if ((await this.repository.countProjects(membership.teamId)) >= limits.projectsPerTeam) {
      throw new ConflictException(`A team has at most ${limits.projectsPerTeam} projects`);
    }
    if (await this.repository.projectSlugTaken(input.slug)) {
      throw new ConflictException('That address is taken');
    }
    const project = await this.repository.createProject(membership.teamId, input.name, input.slug);
    await this.teams.record(ctx, membership.teamId, 'project.created', project.slug);
    return this.view(project);
  }

  async update(ctx: CloudCtx, id: string, input: UpdateProjectInput): Promise<ProjectView> {
    const { project } = await this.project(ctx, id, 'ADMIN');
    const updated = await this.repository.updateProject(project.id, { name: input.name });
    await this.teams.record(ctx, project.teamId, 'project.renamed', project.slug, {
      name: input.name,
    });
    return this.view(updated);
  }

  /** Takes the project offline and deletes its files; its address stays taken 30 days. */
  async remove(ctx: CloudCtx, id: string): Promise<void> {
    const { project } = await this.project(ctx, id, 'ADMIN');
    await this.takeDown(project);
    await this.repository.softDeleteProject(project.id, new Date());
    await this.teams.record(ctx, project.teamId, 'project.deleted', project.slug);
  }

  private async takeDown(project: ProjectRow): Promise<void> {
    const [rows] = await this.repository.deployments(project.id, 0, 10_000);
    await this.storage.unlinkHost(productionLabel(project.slug));
    for (const deployment of rows) {
      await this.storage.unlinkHost(deploymentLabel(project.slug, deployment.shortId));
      await this.storage.removeDeployment(deployment.id);
    }
    for (const branch of new Set(rows.flatMap((d) => (d.branch ? [d.branch] : [])))) {
      await this.storage.unlinkHost(branchLabel(project.slug, branch));
    }
    for (const domain of project.domains) await this.storage.removeDomain(domain.name);
  }

  // ── Deployments ────────────────────────────────────────────────────────────────────────────

  async deployments(
    ctx: CloudCtx,
    id: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<DeploymentView>> {
    const { project } = await this.project(ctx, id);
    const { skip, take } = pageToSkipTake(page, pageSize);
    const [rows, total] = await this.repository.deployments(project.id, skip, take);
    const newest = await this.newestPreviews(project);
    return paginate(
      rows.map((row) => this.deploymentView(project, row, newest)),
      total,
      page,
      pageSize,
    );
  }

  async deployment(ctx: CloudCtx, id: string, deploymentId: string): Promise<DeploymentView> {
    const { project } = await this.project(ctx, id);
    const row = await this.repository.findDeployment(project.id, deploymentId);
    if (!row) throw new NotFoundException('Deployment not found');
    return this.deploymentView(project, row, await this.newestPreviews(project));
  }

  /**
   * Unpacks an uploaded bundle as a new deployment; production ones go live at once. The upload
   * (a temporary file) is always deleted.
   */
  async deploy(
    ctx: CloudCtx,
    id: string,
    bundle: string | undefined,
    fields: DeploymentFields,
  ): Promise<DeploymentView> {
    try {
      if (!bundle) throw new BundleError('Send the folder as a tar.gz in the field "bundle"');
      this.storage.hosting();
      const { project, membership } = await this.project(ctx, id);
      return await this.deployBundle(project, membership.team.plan, bundle, fields, {
        ctx,
        createdById: ctx.user.id,
        tokenId: ctx.user.token?.id ?? null,
      });
    } finally {
      if (bundle) await rm(bundle, { force: true });
    }
  }

  /**
   * Checks the team's limits, unpacks a bundle as a new deployment and, for production, publishes
   * it. Shared by uploads (`codeqlick deploy`) and builds from Git; the caller deletes the bundle.
   */
  async deployBundle(
    project: ProjectRow,
    plan: 'FREE' | 'PRO',
    bundle: string,
    fields: DeploymentFields,
    who: { ctx?: CloudCtx; actorName?: string; createdById: string | null; tokenId: string | null },
  ): Promise<DeploymentView> {
    this.storage.hosting();
    if (project.suspendedAt) throw new ForbiddenException('This project is suspended');
    this.disk.assertRoom();
    const limits = this.teams.limits(plan);
    const lastHour = await this.repository.countDeploymentsSince(
      project.teamId,
      new Date(Date.now() - HOUR_MS),
    );
    if (lastHour >= limits.deploymentsPerHour) {
      throw new HttpException(
        `At most ${limits.deploymentsPerHour} deployments an hour per team`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const used = await this.repository.storageBytes(project.teamId);
    const room = limits.storageBytesPerTeam - used;
    if (room <= 0) {
      throw new BundleError('The team has used all its storage', HttpStatus.PAYLOAD_TOO_LARGE);
    }

    const deploymentId = randomUUID();
    let shortId = deploymentId.replace(/-/g, '').slice(0, 8);
    // A clash of the first 8 hex digits within one project is rare; take another id then.
    if (await this.repository.shortIdTaken(project.id, shortId)) {
      shortId = randomUUID().replace(/-/g, '').slice(0, 8);
    }
    const unpacked = await this.storage.unpack(bundle, deploymentId, {
      bytes: Math.min(limits.deploymentBytes, room),
      files: limits.deploymentFiles,
    });
    let row: DeploymentRow;
    try {
      row = await this.repository.createDeployment({
        id: deploymentId,
        projectId: project.id,
        shortId,
        target: fields.target === 'production' ? 'PRODUCTION' : 'PREVIEW',
        message: fields.message ?? null,
        commit: fields.commit ?? null,
        branch: fields.branch ?? null,
        sizeBytes: BigInt(unpacked.sizeBytes),
        fileCount: unpacked.fileCount,
        createdById: who.createdById,
        tokenId: who.tokenId,
      });
      await this.storage.link(deploymentLabel(project.slug, shortId), deploymentId);
    } catch (error) {
      await this.storage.removeDeployment(deploymentId);
      throw error;
    }
    // Best effort and after the cleanup above: a failure here never deletes a good deployment.
    if (row.target === 'PREVIEW' && row.branch) {
      try {
        await this.relinkBranches(project, [row.branch]);
      } catch (error) {
        this.logger.warn(`Branch address of ${project.slug} not updated: ${String(error)}`);
      }
    }
    const record = (action: string, details?: Record<string, string | number>) =>
      who.ctx
        ? this.teams.record(who.ctx, project.teamId, action, `${project.slug}--${shortId}`, details)
        : this.teams.recordSystem(
            project.teamId,
            who.actorName ?? 'Codeqlick Cloud',
            action,
            `${project.slug}--${shortId}`,
            details,
          );
    await record('deployment.created', {
      target: fields.target,
      sizeBytes: unpacked.sizeBytes,
      fileCount: unpacked.fileCount,
      ...(fields.commit ? { commit: fields.commit } : {}),
    });
    if (fields.target === 'production') {
      await this.makeProduction(project, deploymentId);
      await record('deployment.promoted');
      return this.deploymentView({ ...project, productionDeploymentId: deploymentId }, row);
    }
    // A new preview is its branch's newest by definition.
    return this.deploymentView(project, row, new Set([row.id]));
  }

  async promote(ctx: CloudCtx, id: string, deploymentId: string): Promise<ProjectView> {
    const { project } = await this.project(ctx, id);
    if (project.suspendedAt) throw new ForbiddenException('This project is suspended');
    this.storage.hosting();
    const row = await this.repository.findDeployment(project.id, deploymentId);
    if (!row) throw new NotFoundException('Deployment not found');
    await this.makeProduction(project, row.id);
    await this.teams.record(
      ctx,
      project.teamId,
      'deployment.promoted',
      `${project.slug}--${row.shortId}`,
    );
    const updated = await this.repository.findProject(project.id);
    return this.viewWithBranch(updated ?? project);
  }

  private async makeProduction(project: ProjectRow, deploymentId: string): Promise<void> {
    await this.repository.updateProject(project.id, { productionDeploymentId: deploymentId });
    await this.storage.link(productionLabel(project.slug), deploymentId);
  }

  async removeDeployment(ctx: CloudCtx, id: string, deploymentId: string): Promise<void> {
    const { project } = await this.project(ctx, id);
    const row = await this.repository.findDeployment(project.id, deploymentId);
    if (!row) throw new NotFoundException('Deployment not found');
    if (project.productionDeploymentId === row.id) {
      throw new ConflictException('Promote another deployment before deleting production');
    }
    await this.repository.deleteDeployment(row.id);
    // The branch address moves on before the files go, so it never points at nothing.
    if (row.branch) await this.tryRelink(project, [row.branch]);
    await this.storage.unlinkHost(deploymentLabel(project.slug, row.shortId));
    await this.storage.removeDeployment(row.id);
    await this.teams.record(
      ctx,
      project.teamId,
      'deployment.deleted',
      `${project.slug}--${row.shortId}`,
    );
  }

  // ── Suspension (admin) ─────────────────────────────────────────────────────────────────────

  /** Points every address of the project at the "suspended" page, or back at its deployments. */
  async applySuspension(
    project: {
      id: string;
      slug: string;
      gitBranch: string;
      productionDeploymentId: string | null;
    },
    suspended: boolean,
  ): Promise<void> {
    if (!this.storage.available) return;
    const [rows] = await this.repository.deployments(project.id, 0, 10_000);
    for (const row of rows) {
      const label = deploymentLabel(project.slug, row.shortId);
      if (suspended) await this.storage.linkSuspended(label);
      else await this.storage.link(label, row.id);
    }
    const branches = rows.flatMap((row) =>
      row.target === 'PREVIEW' && row.branch ? [row.branch] : [],
    );
    // Every branch address, the production branch's old one included, follows the project.
    await this.relinkBranches(
      { ...project, suspendedAt: suspended ? new Date() : null },
      branches,
      suspended,
    );
    const production = productionLabel(project.slug);
    if (suspended) await this.storage.linkSuspended(production);
    else if (project.productionDeploymentId)
      await this.storage.link(production, project.productionDeploymentId);
  }

  /** `relinkBranches` that only logs a failure: the deployment is already gone. */
  async tryRelink(
    project: { id: string; slug: string; gitBranch: string; suspendedAt: Date | null },
    branches: string[],
  ): Promise<void> {
    try {
      await this.relinkBranches(project, branches);
    } catch (error) {
      this.logger.warn(`Branch addresses of ${project.slug} not updated: ${String(error)}`);
    }
  }

  /** The newest preview of each branch address of a project: label → deployment id. */
  private async branchHeads(project: {
    id: string;
    slug: string;
    gitBranch: string;
  }): Promise<Map<string, string>> {
    const heads = new Map<string, string>();
    // Newest first; `feature/x` and `feature-x` share a label, so the newest of both wins.
    for (const row of await this.repository.previewHeads(project.id)) {
      if (!row.branch || row.branch === project.gitBranch) continue;
      const label = branchLabel(project.slug, row.branch);
      if (!heads.has(label)) heads.set(label, row.id);
    }
    return heads;
  }

  private async newestPreviews(project: {
    id: string;
    slug: string;
    gitBranch: string;
  }): Promise<Set<string>> {
    return new Set((await this.branchHeads(project)).values());
  }

  /**
   * Points the branches' fixed addresses at their newest preview deployments, at the suspended
   * page while the project is suspended, or removes them when no preview is left. A branch
   * that is the project's production branch has no address. Recomputed from the database; with
   * `suspend` the addresses just go to the suspended page.
   */
  async relinkBranches(
    project: { id: string; slug: string; gitBranch: string; suspendedAt: Date | null },
    branches: string[],
    suspend = false,
  ): Promise<void> {
    if (!this.storage.available) return;
    for (const label of new Set(branches.map((branch) => branchLabel(project.slug, branch)))) {
      if (suspend) {
        await this.storage.linkSuspended(label);
        continue;
      }
      // Re-checked after writing, so a deploy that lands meanwhile can't leave a stale target.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        // Suspension is read again each time: a deploy begun before it mustn't publish content.
        const fresh = await this.repository.findProject(project.id);
        if (!fresh) {
          await this.storage.unlinkHost(label);
          break;
        }
        const suspended = project.suspendedAt !== null || fresh.suspendedAt !== null;
        const id = (await this.branchHeads(project)).get(label) ?? null;
        if (id === null) await this.storage.unlinkHost(label);
        else if (suspended) await this.storage.linkSuspended(label);
        else await this.storage.link(label, id);
        if (((await this.branchHeads(project)).get(label) ?? null) === id) break;
      }
    }
  }

  // ── Housekeeping ───────────────────────────────────────────────────────────────────────────

  /** Hourly: old deployments, projects deleted 30 days ago, expired tokens, old events. */
  async housekeeping(now = new Date()): Promise<void> {
    try {
      for (const old of await this.repository.oldDeployments(KEPT_DEPLOYMENTS)) {
        await this.repository.deleteDeployment(old.id);
        if (old.branch) {
          await this.tryRelink(
            {
              id: old.project_id,
              slug: old.slug,
              gitBranch: old.git_branch,
              suspendedAt: old.suspended_at,
            },
            [old.branch],
          );
        }
        await this.storage.unlinkHost(deploymentLabel(old.slug, old.short_id));
        await this.storage.removeDeployment(old.id);
      }
      await this.repository.purgeDeletedProjects(
        new Date(now.getTime() - DELETED_PROJECT_DAYS * DAY_MS),
      );
      await this.tokens.cleanup(now);
      await this.repository.deleteEventsBefore(new Date(now.getTime() - EVENTS_DAYS * DAY_MS));
    } catch (error) {
      this.logger.error(`Cloud housekeeping failed: ${String(error)}`);
    }
  }

  // ── Views ──────────────────────────────────────────────────────────────────────────────────

  /** `view` with the production preview's branch address (one query, for single projects). */
  private async viewWithBranch(project: ProjectRow): Promise<ProjectView> {
    const production = project.production;
    if (production?.target !== 'PREVIEW' || !production.branch) return this.view(project);
    return this.view(project, await this.newestPreviews(project));
  }

  view(project: ProjectRow, newestPreviews?: ReadonlySet<string>): ProjectView {
    return {
      id: project.id,
      slug: project.slug,
      name: project.name,
      team: { slug: project.team.slug, name: project.team.name },
      url: this.projectUrl(project.slug),
      production: project.production
        ? this.deploymentView(project, project.production, newestPreviews)
        : null,
      domains: project.domains.map((d) => ({ name: d.name, state: d.state })),
      suspended:
        project.suspendedAt && project.suspendedReason
          ? { at: project.suspendedAt.toISOString(), reason: project.suspendedReason }
          : null,
      createdAt: project.createdAt.toISOString(),
    };
  }

  /**
   * `newestPreviews` holds the ids of the previews that are their branch's newest: only those
   * (and never the production branch's) carry `branchUrl`. Without it there is none.
   */
  deploymentView(
    project: { slug: string; gitBranch: string; productionDeploymentId: string | null },
    row: DeploymentRow,
    newestPreviews: ReadonlySet<string> = new Set(),
  ): DeploymentView {
    return {
      id: row.id,
      shortId: row.shortId,
      url: this.deploymentUrl(project.slug, row.shortId),
      branchUrl:
        row.target === 'PREVIEW' &&
        row.branch &&
        row.branch !== project.gitBranch &&
        newestPreviews.has(row.id)
          ? this.branchUrl(project.slug, row.branch)
          : null,
      target: row.target === 'PRODUCTION' ? 'production' : 'preview',
      isProduction: project.productionDeploymentId === row.id,
      message: row.message,
      commit: row.commit,
      branch: row.branch,
      sizeBytes: Number(row.sizeBytes),
      fileCount: row.fileCount,
      createdBy: row.createdBy,
      viaToken: row.token?.name ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
