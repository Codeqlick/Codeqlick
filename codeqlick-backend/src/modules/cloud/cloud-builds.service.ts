import { createHmac, timingSafeEqual } from 'node:crypto';
import { rm } from 'node:fs/promises';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import type { CloudBuild, CloudBuildTrigger } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { SecretBox } from '../auth/secret-box.js';
import type { CloudCtx } from './cloud-caller.js';
import { madridMonth } from './cloud-form-fields.js';
import { CLOUD_PLANS } from './cloud-plans.js';
import { CloudProjectsService } from './cloud-projects.service.js';
import { parseDotenv, type DotenvError } from './cloud-dotenv.js';
import type {
  EnvImportInput,
  EnvVarInput,
  FinishInput,
  GitSettingsInput,
  LinkInstallationInput,
} from './cloud.schemas.js';
import {
  CloudBuildsRepository,
  type BuildWithProject,
  type EnvImportOutcome,
} from './cloud-builds.repository.js';
import { CloudNotificationsService } from './cloud-notifications.service.js';
import { CloudTeamsService } from './cloud-teams.service.js';
import { GithubClient, GithubError } from './github.client.js';

/** The most line errors an import answers with. */
const IMPORT_ERRORS_MAX = 100;

/**
 * A refused import: `400` with each line's problem (never a value). The problem details filter
 * answers any error list with the detail "Validation failed", so that is the message here too.
 */
function importRefused(errors: DotenvError[]): BadRequestException {
  return new BadRequestException({
    message: 'Validation failed',
    errors: errors.slice(0, IMPORT_ERRORS_MAX).map((e) => ({ path: 'content', ...e })),
  });
}

function overLimit(entry: { line: number; key: string }, limit: number): DotenvError {
  return { line: entry.line, key: entry.key, message: `A project has at most ${limit} variables` };
}

export interface BuildView {
  id: string;
  number: number;
  trigger: 'push' | 'pull_request' | 'manual';
  target: 'preview' | 'production';
  branch: string;
  commit: string;
  commitMessage: string | null;
  author: string | null;
  pullRequest: number | null;
  status: CloudBuild['status'];
  error: string | null;
  deploymentId: string | null;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface BuildDetail extends BuildView {
  log: string;
  /** Where the log continues from (the next `after`). */
  logOffset: number;
}

export interface GitView {
  installationId: number | null;
  repoId: number | null;
  repo: string | null;
  branch: string;
  rootDir: string;
  installCommand: string;
  buildCommand: string;
  outputDir: string;
  nodeVersion: string;
  buildBranches: boolean;
  buildPullRequests: boolean;
}

export interface ClaimedBuild {
  id: string;
  cloneUrl: string;
  commit: string;
  rootDir: string;
  installCommand: string;
  buildCommand: string;
  outputDir: string;
  nodeVersion: string;
  env: Record<string, string>;
  timeoutSeconds: number;
  /** Values the agent hides from the log. */
  secrets: string[];
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const STATE_MINUTES = 30;

/** Builds from Git (architecture 4.13, 8.4; decisions 40–42). */
@Injectable()
export class CloudBuildsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CloudBuildsService.name);
  private readonly box: SecretBox;
  private readonly stateKey: Buffer;
  private timer?: NodeJS.Timeout;
  private daily?: NodeJS.Timeout;

  constructor(
    private readonly repository: CloudBuildsRepository,
    private readonly projects: CloudProjectsService,
    private readonly teams: CloudTeamsService,
    private readonly github: GithubClient,
    private readonly config: AppConfigService,
    private readonly notifications: CloudNotificationsService,
  ) {
    this.box = new SecretBox(config.credentialsSecret, 'cloud-env-v1');
    this.stateKey = createHmac('sha256', config.jwtAccessSecret)
      .update('cloud-github-state-v1')
      .digest();
  }

  onApplicationBootstrap(): void {
    if (this.config.isTest) return;
    this.timer = setInterval(() => void this.failStale(), 30 * SECOND).unref();
    this.daily = setInterval(
      () => void this.repository.cleanup(new Date()).catch(() => undefined),
      24 * 60 * MINUTE,
    ).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.daily) clearInterval(this.daily);
  }

  // ── Linking GitHub (decision 40) ───────────────────────────────────────────────────────────

  private sign(payload: object): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${createHmac('sha256', this.stateKey).update(body).digest('base64url')}`;
  }

  private verify(state: string): { t: string; u: string; e: number; p?: string } | null {
    const [body, mac] = state.split('.');
    if (!body || !mac) return null;
    const expected = createHmac('sha256', this.stateKey).update(body).digest();
    const given = Buffer.from(mac, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    try {
      const value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
        t: string;
        u: string;
        e: number;
        p?: string;
      };
      return value.e > Date.now() ? value : null;
    } catch {
      return null;
    }
  }

  async installUrl(
    ctx: CloudCtx,
    teamSlug: string,
    projectSlug?: string,
  ): Promise<{ url: string }> {
    const membership = await this.teams.access(ctx, teamSlug, 'ADMIN');
    const app = this.config.githubApp;
    if (!app) throw new ServiceUnavailableException('Builds from Git are not set up yet');
    const state = this.sign({
      t: membership.teamId,
      u: ctx.user.id,
      e: Date.now() + STATE_MINUTES * MINUTE,
      ...(projectSlug ? { p: projectSlug } : {}),
    });
    return {
      url: `https://github.com/apps/${app.slug}/installations/new?state=${encodeURIComponent(state)}`,
    };
  }

  async link(ctx: CloudCtx, input: LinkInstallationInput) {
    const state = this.verify(input.state);
    if (!state || state.u !== ctx.user.id)
      throw new ForbiddenException('This link has expired: connect GitHub again');
    await this.teams.accessById(ctx, state.t, 'ADMIN');
    let visible: number[];
    try {
      visible = await this.github.userInstallationIds(await this.github.userToken(input.code));
    } catch {
      throw new ForbiddenException("GitHub didn't confirm the installation: connect GitHub again");
    }
    if (!visible.includes(input.installationId)) {
      throw new ForbiddenException("Your GitHub account can't see that installation");
    }
    const existing = await this.repository.installation(BigInt(input.installationId));
    if (existing && existing.teamId !== state.t) {
      throw new ConflictException('That GitHub installation is linked to another team');
    }
    const account = await this.github.installation(input.installationId);
    const saved = await this.repository.saveInstallation({
      installationId: BigInt(input.installationId),
      teamId: state.t,
      accountLogin: account.login,
      accountType: account.type,
      createdById: ctx.user.id,
    });
    await this.teams.record(ctx, state.t, 'github.connected', account.login);
    const team = (await this.teams.me(ctx)).teams.find((t) => t.id === state.t);
    return {
      installation: { id: Number(saved.installationId), accountLogin: saved.accountLogin },
      team: team?.slug ?? null,
      project: state.p ?? null,
    };
  }

  async teamGithub(ctx: CloudCtx, teamSlug: string) {
    const membership = await this.teams.access(ctx, teamSlug);
    const installations = await this.repository.installations(membership.teamId);
    return {
      configured: this.github.configured,
      installations: installations.map((i) => ({
        id: Number(i.installationId),
        accountLogin: i.accountLogin,
        accountType: i.accountType,
        suspended: i.suspendedAt !== null,
      })),
    };
  }

  private async teamInstallation(teamId: string, installationId: number) {
    const installation = await this.repository.installation(BigInt(installationId));
    if (!installation || installation.teamId !== teamId)
      throw new NotFoundException('GitHub installation not found');
    return installation;
  }

  async repos(ctx: CloudCtx, teamSlug: string, installationId: number) {
    const membership = await this.teams.access(ctx, teamSlug);
    await this.teamInstallation(membership.teamId, installationId);
    return { items: await this.github.repositories(installationId) };
  }

  // ── A project's connection and settings ────────────────────────────────────────────────────

  gitView(project: {
    gitInstallationId: bigint | null;
    gitRepoId: bigint | null;
    gitRepo: string | null;
    gitBranch: string;
    rootDir: string;
    installCommand: string;
    buildCommand: string;
    outputDir: string;
    nodeVersion: string;
    buildBranches: boolean;
    buildPullRequests: boolean;
  }): GitView {
    return {
      installationId: project.gitInstallationId === null ? null : Number(project.gitInstallationId),
      repoId: project.gitRepoId === null ? null : Number(project.gitRepoId),
      repo: project.gitRepo,
      branch: project.gitBranch,
      rootDir: project.rootDir,
      installCommand: project.installCommand,
      buildCommand: project.buildCommand,
      outputDir: project.outputDir,
      nodeVersion: project.nodeVersion,
      buildBranches: project.buildBranches,
      buildPullRequests: project.buildPullRequests,
    };
  }

  async git(ctx: CloudCtx, projectId: string): Promise<GitView> {
    const { project } = await this.projects.project(ctx, projectId);
    return this.gitView(project);
  }

  async setGit(ctx: CloudCtx, projectId: string, input: GitSettingsInput): Promise<GitView> {
    const { project } = await this.projects.project(ctx, projectId, 'ADMIN');
    await this.teamInstallation(project.teamId, input.installationId);
    const repo = (await this.github.repositories(input.installationId)).find(
      (r) => r.id === input.repoId,
    );
    if (!repo) throw new BadRequestException("That repository isn't in the GitHub installation");
    await this.repository.setGit(project.id, {
      gitInstallationId: BigInt(input.installationId),
      gitRepoId: BigInt(repo.id),
      gitRepo: repo.fullName,
      gitBranch: input.branch,
      ...(input.rootDir !== undefined ? { rootDir: input.rootDir } : {}),
      ...(input.installCommand !== undefined ? { installCommand: input.installCommand } : {}),
      ...(input.buildCommand !== undefined ? { buildCommand: input.buildCommand } : {}),
      ...(input.outputDir !== undefined ? { outputDir: input.outputDir } : {}),
      ...(input.nodeVersion !== undefined ? { nodeVersion: input.nodeVersion } : {}),
      ...(input.buildBranches !== undefined ? { buildBranches: input.buildBranches } : {}),
      ...(input.buildPullRequests !== undefined
        ? { buildPullRequests: input.buildPullRequests }
        : {}),
    });
    await this.teams.record(
      ctx,
      project.teamId,
      'git.connected',
      `${project.slug}: ${repo.fullName}`,
      { branch: input.branch },
    );
    return this.git(ctx, projectId);
  }

  async disconnect(ctx: CloudCtx, projectId: string): Promise<void> {
    const { project } = await this.projects.project(ctx, projectId, 'ADMIN');
    await this.repository.setGit(project.id, {
      gitInstallationId: null,
      gitRepoId: null,
      gitRepo: null,
    });
    await this.teams.record(ctx, project.teamId, 'git.disconnected', project.slug);
  }

  // ── Environment variables (decision 42) ────────────────────────────────────────────────────

  async envVars(ctx: CloudCtx, projectId: string) {
    const { project } = await this.projects.project(ctx, projectId);
    const rows = await this.repository.envVars(project.id);
    return {
      items: rows.map((row) => ({
        key: row.key,
        production: row.production,
        preview: row.preview,
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async setEnvVar(ctx: CloudCtx, projectId: string, input: EnvVarInput) {
    const { project, membership } = await this.projects.project(ctx, projectId, 'ADMIN');
    const existing = (await this.repository.envVars(project.id)).some(
      (row) => row.key === input.key,
    );
    const limit = CLOUD_PLANS[membership.team.plan].envVarsPerProject;
    if (!existing && (await this.repository.countEnvVars(project.id)) >= limit) {
      throw new ConflictException(`A project has at most ${limit} variables`);
    }
    await this.repository.saveEnvVar(
      project.id,
      input.key,
      this.box.seal(input.value),
      input.production,
      input.preview,
    );
    await this.teams.record(ctx, project.teamId, 'env.saved', `${project.slug}: ${input.key}`);
    return this.envVars(ctx, projectId);
  }

  /** Imports a `.env` file, all or nothing (architecture 4.13). Values are never sent back. */
  async importEnvVars(
    ctx: CloudCtx,
    projectId: string,
    input: EnvImportInput,
  ): Promise<EnvImportOutcome> {
    const { project, membership } = await this.projects.project(ctx, projectId, 'ADMIN');
    const { entries, errors } = parseDotenv(input.content);
    if (errors.length > 0) throw importRefused(errors);
    if (entries.length === 0) {
      throw importRefused([{ line: 1, message: 'No variables in the file' }]);
    }
    const limit = CLOUD_PLANS[membership.team.plan].envVarsPerProject;
    // A file with more names than the limit can't fit whatever exists: refuse before sealing.
    const first = entries[limit];
    if (first) throw importRefused([overLimit(first, limit)]);
    const vars = entries.map((entry) => ({
      key: entry.key,
      valueSealed: this.box.seal(entry.value),
    }));
    const outcome = await this.repository.importEnvVars(project.id, vars, {
      production: input.production,
      preview: input.preview,
      overwrite: input.overwrite,
      limit,
    });
    if ('overLimit' in outcome) {
      const entry = entries.find((e) => e.key === outcome.overLimit)!;
      throw importRefused([overLimit(entry, limit)]);
    }
    await this.teams.record(ctx, project.teamId, 'env.imported', project.slug, {
      keys: { created: outcome.created, updated: outcome.updated, skipped: outcome.skipped },
      production: input.production,
      preview: input.preview,
    });
    return outcome;
  }

  async deleteEnvVar(ctx: CloudCtx, projectId: string, key: string): Promise<void> {
    const { project } = await this.projects.project(ctx, projectId, 'ADMIN');
    if (!(await this.repository.deleteEnvVar(project.id, key)))
      throw new NotFoundException('Variable not found');
    await this.teams.record(ctx, project.teamId, 'env.deleted', `${project.slug}: ${key}`);
  }

  // ── Builds ─────────────────────────────────────────────────────────────────────────────────

  view(build: Omit<CloudBuild, 'log'>): BuildView {
    const end = build.finishedAt ?? (build.status === 'RUNNING' ? new Date() : null);
    return {
      id: build.id,
      number: build.number,
      trigger:
        build.trigger === 'PULL_REQUEST'
          ? 'pull_request'
          : build.trigger === 'MANUAL'
            ? 'manual'
            : 'push',
      target: build.target === 'PRODUCTION' ? 'production' : 'preview',
      branch: build.branch,
      commit: build.commit,
      commitMessage: build.commitMessage,
      author: build.author,
      pullRequest: build.pullRequest,
      status: build.status,
      error: build.error,
      deploymentId: build.deploymentId,
      queuedAt: build.queuedAt.toISOString(),
      startedAt: build.startedAt?.toISOString() ?? null,
      finishedAt: build.finishedAt?.toISOString() ?? null,
      durationMs: build.startedAt && end ? end.getTime() - build.startedAt.getTime() : null,
    };
  }

  async list(
    ctx: CloudCtx,
    projectId: string,
    page: number,
    pageSize: number,
  ): Promise<Paginated<BuildView>> {
    const { project } = await this.projects.project(ctx, projectId);
    const { skip, take } = pageToSkipTake(page, pageSize);
    const [rows, total] = await this.repository.builds(project.id, skip, take);
    return paginate(
      rows.map((row) => this.view(row)),
      total,
      page,
      pageSize,
    );
  }

  async get(ctx: CloudCtx, projectId: string, number: number, after: number): Promise<BuildDetail> {
    const { project } = await this.projects.project(ctx, projectId);
    const build = await this.repository.findBuild(project.id, number);
    if (!build) throw new NotFoundException('Build not found');
    return { ...this.view(build), log: build.log.slice(after), logOffset: build.log.length };
  }

  /** "Deploy again": a build of the branch's latest commit. */
  async manual(ctx: CloudCtx, projectId: string, branch: string | undefined): Promise<BuildView> {
    const { project } = await this.projects.project(ctx, projectId);
    if (!project.gitInstallationId || !project.gitRepoId || !project.gitRepo) {
      throw new ConflictException('Connect a GitHub repository first');
    }
    const target = branch ?? project.gitBranch;
    let head;
    try {
      head = await this.github.branchHead(
        project.gitInstallationId,
        project.gitRepoId,
        project.gitRepo,
        target,
      );
    } catch (error) {
      if (error instanceof GithubError && error.status === 404)
        throw new NotFoundException('That branch was not found');
      throw error;
    }
    const build = await this.queue(
      { ...project, team: { slug: project.team.slug, plan: project.team.plan } },
      {
        trigger: 'MANUAL',
        branch: target,
        commit: head.sha,
        commitMessage: head.message,
        author: head.author,
        pullRequest: null,
        createdById: ctx.user.id,
      },
    );
    return this.view(build);
  }

  async cancel(ctx: CloudCtx, projectId: string, number: number): Promise<BuildView> {
    const { project } = await this.projects.project(ctx, projectId);
    const build = await this.repository.findBuild(project.id, number);
    if (!build) throw new NotFoundException('Build not found');
    if (build.status !== 'QUEUED' && build.status !== 'RUNNING')
      throw new ConflictException('The build has finished');
    const updated = await this.repository.update(build.id, {
      status: 'CANCELED',
      finishedAt: new Date(),
      error: `Canceled by ${ctx.user.name || ctx.user.email}`,
    });
    return this.view(updated);
  }

  /**
   * Queues a build of a commit for a project: production for its branch, a preview otherwise. Over
   * the month's builds it is recorded as failed. Older queued builds of the branch are canceled.
   */
  private async queue(
    project: {
      id: string;
      teamId: string;
      slug: string;
      gitBranch: string;
      gitInstallationId: bigint | null;
      gitRepoId: bigint | null;
      gitRepo: string | null;
      team: { slug: string; plan: 'FREE' | 'PRO' };
    },
    input: {
      trigger: CloudBuildTrigger;
      branch: string;
      commit: string;
      commitMessage: string | null;
      author: string | null;
      pullRequest: number | null;
      createdById: string | null;
    },
    now = new Date(),
  ): Promise<CloudBuild> {
    const limit = CLOUD_PLANS[project.team.plan].buildsPerMonth;
    const over =
      (await this.repository.countBuildsSince(project.teamId, madridMonth(now).start)) >= limit;
    await this.repository.cancelSuperseded(project.id, input.branch, now);
    const build = await this.repository.createBuild({
      projectId: project.id,
      trigger: input.trigger,
      target:
        input.pullRequest === null && input.branch === project.gitBranch ? 'PRODUCTION' : 'PREVIEW',
      branch: input.branch,
      commit: input.commit,
      commitMessage: input.commitMessage?.slice(0, 500) ?? null,
      author: input.author?.slice(0, 100) ?? null,
      pullRequest: input.pullRequest,
      createdById: input.createdById,
      queuedAt: now,
      ...(over
        ? {
            status: 'FAILED' as const,
            finishedAt: now,
            error: `The team reached its ${limit} builds this month`,
          }
        : {}),
    });
    void this.report(project, build, over ? 'failure' : 'pending');
    if (over) void this.notifications.buildEnded(build.id);
    return build;
  }

  // ── GitHub's webhook ───────────────────────────────────────────────────────────────────────

  /** Checks the signature of a delivery (`X-Hub-Signature-256: sha256=…`). */
  checkSignature(raw: Buffer | undefined, signature: string | undefined): void {
    const app = this.config.githubApp;
    if (!app) throw new ServiceUnavailableException('Builds from Git are not set up yet');
    if (!raw || !signature?.startsWith('sha256=')) throw new UnauthorizedException('Not signed');
    const expected = createHmac('sha256', app.webhookSecret).update(raw).digest();
    const given = Buffer.from(signature.slice(7), 'hex');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new UnauthorizedException('Bad signature');
    }
  }

  async webhook(
    event: string | undefined,
    delivery: string | undefined,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (delivery && !(await this.repository.firstDelivery(delivery.slice(0, 64)))) return;
    const installationId = (payload.installation as { id?: number } | undefined)?.id;
    if (!installationId) return;
    const installation = BigInt(installationId);
    switch (event) {
      case 'installation': {
        const action = payload.action as string;
        if (action === 'deleted') await this.repository.removeInstallation(installation);
        if (action === 'suspend')
          await this.repository.suspendInstallation(installation, new Date());
        if (action === 'unsuspend') await this.repository.suspendInstallation(installation, null);
        return;
      }
      case 'installation_repositories': {
        const removed = (payload.repositories_removed as Array<{ id: number }> | undefined) ?? [];
        if (removed.length > 0)
          await this.repository.unlinkRepos(
            installation,
            removed.map((r) => BigInt(r.id)),
          );
        return;
      }
      case 'push':
        return this.onPush(installation, payload);
      case 'pull_request':
        return this.onPullRequest(installation, payload);
      default:
        return;
    }
  }

  private async onPush(installation: bigint, payload: Record<string, unknown>): Promise<void> {
    const ref = String(payload.ref ?? '');
    if (!ref.startsWith('refs/heads/') || payload.deleted === true) return;
    const branch = ref.slice('refs/heads/'.length);
    const commit = String(payload.after ?? '');
    const head = payload.head_commit as { message?: string; author?: { name?: string } } | null;
    if (!/^[0-9a-f]{40}$/.test(commit) || head?.message?.includes('[skip cloud]')) return;
    const repoId = (payload.repository as { id?: number } | undefined)?.id;
    if (!repoId) return;
    for (const project of await this.repository.projectsForRepo(installation, BigInt(repoId))) {
      if (branch !== project.gitBranch && !project.buildBranches) continue;
      await this.queue(project, {
        trigger: 'PUSH',
        branch,
        commit,
        commitMessage: head?.message ?? null,
        author: head?.author?.name ?? null,
        pullRequest: null,
        createdById: null,
      });
    }
  }

  private async onPullRequest(
    installation: bigint,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!['opened', 'reopened', 'synchronize'].includes(String(payload.action))) return;
    const pr = payload.pull_request as {
      number: number;
      title?: string;
      user?: { login?: string };
      head: { sha: string; ref: string; repo: { id: number } | null };
      base: { repo: { id: number } };
    };
    // A fork's pull request is a stranger's code with the project's variables: never built (decision 41).
    if (!pr?.head?.repo || pr.head.repo.id !== pr.base.repo.id) return;
    for (const project of await this.repository.projectsForRepo(
      installation,
      BigInt(pr.base.repo.id),
    )) {
      if (!project.buildPullRequests) continue;
      await this.queue(project, {
        trigger: 'PULL_REQUEST',
        branch: pr.head.ref,
        commit: pr.head.sha,
        commitMessage: pr.title ?? null,
        author: pr.user?.login ?? null,
        pullRequest: pr.number,
        createdById: null,
      });
    }
  }

  // ── The build server (decision 41) ─────────────────────────────────────────────────────────

  checkBuilder(authorization: string | undefined): void {
    const token = this.config.cloudBuilderToken;
    if (!token) throw new ServiceUnavailableException('The build server is not set up');
    const given = Buffer.from(authorization?.replace(/^Bearer /, '') ?? '');
    const expected = Buffer.from(token);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      throw new UnauthorizedException('Bad builder token');
    }
  }

  async claim(builder: string): Promise<ClaimedBuild | null> {
    const build = await this.repository.claim(builder, new Date());
    if (!build) return null;
    const project = build.project;
    try {
      if (!project.gitInstallationId || !project.gitRepoId || !project.gitRepo) {
        throw new Error('The project is no longer connected to a repository');
      }
      const token = await this.github.installationToken(
        project.gitInstallationId,
        project.gitRepoId,
      );
      const env: Record<string, string> = {};
      for (const row of await this.repository.envVars(project.id)) {
        if (build.target === 'PRODUCTION' ? row.production : row.preview)
          env[row.key] = this.box.open(row.valueSealed);
      }
      const plan = CLOUD_PLANS[project.team.plan];
      return {
        id: build.id,
        cloneUrl: `https://x-access-token:${token}@github.com/${project.gitRepo}.git`,
        commit: build.commit,
        rootDir: project.rootDir,
        installCommand: project.installCommand,
        buildCommand: project.buildCommand,
        outputDir: project.outputDir,
        nodeVersion: project.nodeVersion,
        env,
        timeoutSeconds: plan.buildMinutes * 60,
        secrets: [token, ...Object.values(env).filter((value) => value.length >= 4)],
      };
    } catch (error) {
      await this.finishFailed(build, error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  private async running(id: string): Promise<BuildWithProject> {
    const build = await this.repository.findById(id);
    if (!build) throw new NotFoundException('Build not found');
    if (build.status === 'CANCELED') throw new ConflictException('The build was canceled');
    if (build.status !== 'RUNNING') throw new ConflictException('The build is not running');
    return build;
  }

  async log(id: string, chunk: string): Promise<void> {
    const status = await this.repository.appendLog(id, chunk.slice(-256 * 1024));
    if (status === null) throw new NotFoundException('Build not found');
    if (status === 'CANCELED') throw new ConflictException('The build was canceled');
  }

  async heartbeat(id: string): Promise<void> {
    await this.running(id);
    await this.repository.update(id, { heartbeatAt: new Date() });
  }

  async finish(id: string, input: FinishInput, bundle: string | undefined): Promise<void> {
    try {
      const build = await this.running(id);
      if (input.status === 'failed' || !bundle) {
        await this.finishFailed(build, input.error ?? 'The build failed');
        return;
      }
      const project = await this.projects.projectRow(build.project.id);
      if (!project) {
        await this.finishFailed(build, 'The project was deleted');
        return;
      }
      try {
        const deployment = await this.projects.deployBundle(
          project,
          build.project.team.plan,
          bundle,
          {
            target: build.target === 'PRODUCTION' ? 'production' : 'preview',
            message: (build.commitMessage ?? '').split('\n')[0]?.slice(0, 200) || undefined,
            commit: build.commit,
            branch: build.branch,
          },
          {
            actorName: `GitHub · ${build.author ?? build.branch}`,
            createdById: build.createdById,
            tokenId: null,
          },
        );
        const done = await this.repository.update(build.id, {
          status: 'SUCCEEDED',
          deploymentId: deployment.id,
          finishedAt: new Date(),
          error: null,
        });
        void this.report(build.project, done, 'success', deployment.url);
        void this.notifications.buildEnded(done.id, deployment.url);
      } catch (error) {
        await this.finishFailed(
          build,
          error instanceof HttpException ? error.message : 'The output could not be deployed',
        );
      }
    } finally {
      if (bundle) await rm(bundle, { force: true });
    }
  }

  private async finishFailed(build: BuildWithProject | CloudBuild, error: string): Promise<void> {
    const done = await this.repository.update(build.id, {
      status: 'FAILED',
      finishedAt: new Date(),
      error: error.slice(0, 500),
    });
    const full = 'project' in build ? build : await this.repository.findById(build.id);
    if (full) void this.report(full.project, done, 'failure');
    void this.notifications.buildEnded(done.id);
  }

  /** Every 30 s: running builds whose agent went quiet for 2 minutes fail. */
  async failStale(now = new Date()): Promise<void> {
    try {
      for (const build of await this.repository.stale(new Date(now.getTime() - 2 * MINUTE))) {
        await this.finishFailed(build, 'The build server stopped answering');
      }
    } catch (error) {
      this.logger.error(`Stale builds check failed: ${String(error)}`);
    }
  }

  // ── Back on GitHub ─────────────────────────────────────────────────────────────────────────

  private buildUrl(project: { slug: string; team: { slug: string } }, build: CloudBuild): string {
    return `${this.config.cloudUrl}/en/console/${project.team.slug}/${project.slug}/builds/${build.number}`;
  }

  /** The commit status and, for pull requests, the app's comment. Best effort: logged, never thrown. */
  private async report(
    project: {
      id: string;
      slug: string;
      gitInstallationId: bigint | null;
      gitRepoId: bigint | null;
      gitRepo: string | null;
      team: { slug: string };
    },
    build: CloudBuild,
    state: 'pending' | 'success' | 'failure',
    deploymentUrl?: string,
  ): Promise<void> {
    if (
      !this.github.configured ||
      !project.gitInstallationId ||
      !project.gitRepoId ||
      !project.gitRepo
    )
      return;
    const buildUrl = this.buildUrl(project, build);
    const description = {
      pending: 'Building…',
      success: build.target === 'PRODUCTION' ? 'Published' : 'Preview ready',
      failure: build.error ?? 'The build failed',
    }[state];
    try {
      await this.github.setStatus(
        project.gitInstallationId,
        project.gitRepoId,
        project.gitRepo,
        build.commit,
        state,
        description,
        deploymentUrl ?? buildUrl,
      );
      if (build.pullRequest !== null) {
        const existing = await this.repository.pullComment(project.id, build.pullRequest);
        const body = [
          `**Codeqlick Cloud** · ${project.slug}`,
          '',
          '| | |',
          '|---|---|',
          `| Commit | \`${build.commit.slice(0, 7)}\` |`,
          `| State | ${{ pending: '⏳ Building', success: '✅ Ready', failure: '❌ Failed' }[state]} |`,
          ...(deploymentUrl ? [`| Preview | ${deploymentUrl} |`] : []),
          `| Build | ${buildUrl} |`,
        ].join('\n');
        const commentId = await this.github.upsertComment(
          project.gitInstallationId,
          project.gitRepoId,
          project.gitRepo,
          build.pullRequest,
          existing?.commentId ?? null,
          body,
        );
        if (!existing)
          await this.repository.savePullComment(project.id, build.pullRequest, commentId);
      }
    } catch (error) {
      this.logger.warn(`Build ${build.id}: GitHub couldn't be told (${String(error)})`);
    }
  }
}
