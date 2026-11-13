import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CloudBuild } from '../../generated/prisma/client.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CloudCtx } from './cloud-caller.js';
import {
  HOOK_CALLS_PER_MINUTE,
  HOOK_IP_CALLS_PER_MINUTE,
  RateWindow,
  hookPrefix,
  isHookToken,
  newHookToken,
} from './cloud-deploy-hooks.js';
import {
  CloudDeployHooksRepository,
  type HookRow,
  type HookWithProject,
} from './cloud-deploy-hooks.repository.js';
import { CloudBuildsService } from './cloud-builds.service.js';
import { CLOUD_PLANS } from './cloud-plans.js';
import { CloudProjectsService } from './cloud-projects.service.js';
import type { CreateHookInput } from './cloud.schemas.js';
import { CloudTeamsService } from './cloud-teams.service.js';
import { sha256 } from './cloud-tokens.service.js';
import { GithubClient, GithubError } from './github.client.js';

export interface HookView {
  id: string;
  name: string;
  branch: string;
  prefix: string;
  lastCalledAt: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
  /** Only in the answer to creating it: the full URL, shown once. */
  url?: string;
}

export interface HookCalled {
  build: { number: number; status: CloudBuild['status']; url: string };
}

const MINUTE = 60_000;

/** GitHub failing is a bad gateway with a reason, not an unexpected error. */
function upstream(error: unknown): unknown {
  return error instanceof GithubError
    ? new BadGatewayException(`GitHub answered ${error.status}: try again in a moment`)
    : error;
}

function hookView(row: HookRow): HookView {
  return {
    id: row.id,
    name: row.name,
    branch: row.branch,
    prefix: row.prefix,
    lastCalledAt: row.lastCalledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdBy,
  };
}

/** Deploy hooks: secret URLs that build a branch when called (architecture 4.13, decision 51). */
@Injectable()
export class CloudDeployHooksService {
  private readonly perHook = new RateWindow(HOOK_CALLS_PER_MINUTE, MINUTE);
  private readonly perIp = new RateWindow(HOOK_IP_CALLS_PER_MINUTE, MINUTE);

  constructor(
    private readonly repository: CloudDeployHooksRepository,
    private readonly projects: CloudProjectsService,
    private readonly teams: CloudTeamsService,
    private readonly builds: CloudBuildsService,
    private readonly github: GithubClient,
    private readonly config: AppConfigService,
  ) {}

  // ── Management (session or API token) ──────────────────────────────────────────────────────

  async list(ctx: CloudCtx, projectId: string): Promise<{ items: HookView[] }> {
    const { project } = await this.projects.project(ctx, projectId);
    return { items: (await this.repository.list(project.id)).map(hookView) };
  }

  async create(ctx: CloudCtx, projectId: string, input: CreateHookInput): Promise<HookView> {
    const { project, membership } = await this.projects.project(ctx, projectId, 'ADMIN');
    if (!project.gitInstallationId || !project.gitRepoId || !project.gitRepo) {
      throw new ConflictException('Connect a GitHub repository first');
    }
    const limit = CLOUD_PLANS[membership.team.plan].deployHooksPerProject;
    const existing = await this.repository.list(project.id);
    if (existing.length >= limit) {
      throw new ConflictException(`A project has at most ${limit} deploy hooks`);
    }
    if (existing.some((hook) => hook.name === input.name)) {
      throw new ConflictException('A deploy hook with that name already exists');
    }
    const branch = input.branch ?? project.gitBranch;
    try {
      await this.github.branchHead(
        project.gitInstallationId,
        project.gitRepoId,
        project.gitRepo,
        branch,
      );
    } catch (error) {
      if (error instanceof GithubError && error.status === 404)
        throw new BadRequestException("That branch isn't in the repository");
      throw upstream(error);
    }
    const token = newHookToken();
    const row = await this.repository.create({
      projectId: project.id,
      name: input.name,
      branch,
      prefix: hookPrefix(token),
      tokenHash: sha256(token),
      createdById: ctx.user.id,
    });
    await this.teams.record(ctx, project.teamId, 'deploy_hook.created', row.name, { branch });
    return { ...hookView(row), url: `${this.config.publicApiUrl}/cloud/hooks/${token}` };
  }

  async remove(ctx: CloudCtx, projectId: string, hookId: string): Promise<void> {
    const { project } = await this.projects.project(ctx, projectId, 'ADMIN');
    const hook = await this.repository.find(project.id, hookId);
    if (!hook || !(await this.repository.delete(project.id, hookId))) {
      throw new NotFoundException('Deploy hook not found');
    }
    await this.teams.record(ctx, project.teamId, 'deploy_hook.deleted', hook.name, {
      branch: hook.branch,
    });
  }

  // ── The public call ────────────────────────────────────────────────────────────────────────

  /** `POST /v1/cloud/hooks/:token`: queues a build of the hook's branch like "Deploy again". */
  async call(token: string, ip: string | null): Promise<HookCalled> {
    if (!this.perIp.take(ip ?? 'unknown')) throw this.tooMany();
    if (!isHookToken(token)) throw new NotFoundException('Deploy hook not found');
    const hook = await this.repository.findByTokenHash(sha256(token));
    if (!hook || hook.project.deletedAt) throw new NotFoundException('Deploy hook not found');
    if (!this.perHook.take(hook.id)) throw this.tooMany();
    await this.repository.touch(hook.id, new Date());

    const project = hook.project;
    let build: CloudBuild;
    try {
      if (project.suspendedAt) throw new ForbiddenException('This project is suspended');
      build = await this.builds.queueHead(project, hook.branch, {
        trigger: 'HOOK',
        hookName: hook.name,
      });
    } catch (error) {
      // A branch that is gone from the repository is a conflict here, not a missing page.
      const refusal =
        error instanceof NotFoundException
          ? new ConflictException('The branch of this hook no longer exists in the repository')
          : upstream(error);
      await this.record(
        hook,
        ip,
        refusal instanceof HttpException ? refusal.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR,
      );
      throw refusal;
    }
    // Over the month's builds the build is recorded as failed, nothing is built (like a push).
    if (build.status === 'FAILED') {
      await this.record(hook, ip, HttpStatus.TOO_MANY_REQUESTS, build.number);
      throw new HttpException(
        build.error ?? 'The team reached its builds this month',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    await this.record(hook, ip, HttpStatus.ACCEPTED, build.number);
    return {
      build: {
        number: build.number,
        status: build.status,
        url: this.builds.buildUrl(project, build),
      },
    };
  }

  private tooMany(): HttpException {
    return new HttpException('Too many calls: try again in a minute', HttpStatus.TOO_MANY_REQUESTS);
  }

  /** The team's event for a call that found a hook: no person, the caller's IP. */
  private async record(
    hook: HookWithProject,
    ip: string | null,
    status: number,
    build?: number,
  ): Promise<void> {
    // recordSystem logs its own failures: a call never fails because its event couldn't be saved.
    await this.teams.recordSystem(
      hook.project.teamId,
      `Deploy hook ${hook.name}`.slice(0, 120),
      'deploy_hook.called',
      hook.name,
      { status, ...(build === undefined ? {} : { build }) },
      ip,
    );
  }
}
