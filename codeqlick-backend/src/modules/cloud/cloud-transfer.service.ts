import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { MailService } from '../mail/mail.service.js';
import { CloudAnalyticsService } from './cloud-analytics.service.js';
import { CloudBuildsRepository } from './cloud-builds.repository.js';
import { ROLE_RANK, type CloudCtx } from './cloud-caller.js';
import { cloudProjectTransferredEmail } from './cloud-emails.js';
import { madridMonth } from './cloud-form-fields.js';
import { CLOUD_PLANS } from './cloud-plans.js';
import { CloudProjectsService, type ProjectView } from './cloud-projects.service.js';
import { CloudTeamsService } from './cloud-teams.service.js';
import { ANALYTICS_BATCH, megabytes, type GitOutcome } from './cloud-transfer.js';
import {
  CloudTransferRepository,
  type TransferState,
  type TransferTeams,
} from './cloud-transfer.repository.js';
import type { TransferProjectInput } from './cloud.schemas.js';
import { CloudRepository, type ProjectRow } from './cloud.repository.js';
import { GithubClient } from './github.client.js';

export type TransferView = ProjectView & { git: GitOutcome };

/**
 * Moving a project to another team (architecture 4.13 "Moving a project to another team",
 * decision 58): an owner of its team who is also an owner or admin of the target.
 */
@Injectable()
export class CloudTransferService {
  private readonly logger = new Logger(CloudTransferService.name);

  constructor(
    private readonly repository: CloudTransferRepository,
    private readonly cloud: CloudRepository,
    private readonly projects: CloudProjectsService,
    private readonly teams: CloudTeamsService,
    private readonly builds: CloudBuildsRepository,
    private readonly github: GithubClient,
    private readonly analytics: CloudAnalyticsService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  async transfer(
    ctx: CloudCtx,
    projectId: string,
    input: TransferProjectInput,
    now = new Date(),
  ): Promise<TransferView> {
    const { project } = await this.projects.project(ctx, projectId, 'OWNER');
    const target = await this.teams.access(ctx, input.team, 'ADMIN');
    if (target.teamId === project.teamId) {
      throw new BadRequestException('The project is already in that team');
    }
    if (project.suspendedAt) throw new ForbiddenException('This project is suspended');

    const teams: TransferTeams = {
      projectId: project.id,
      fromTeamId: project.teamId,
      toTeamId: target.teamId,
      userId: ctx.user.id,
    };
    const check = (state: TransferState) => this.check(state, teams, project.gitRepoId);
    // Checked once before asking GitHub, and again inside the transaction with the rows locked.
    check(await this.repository.state(teams));
    const git = await this.gitTarget(project, target.teamId);

    const monitors = await this.repository.transfer(
      {
        ...teams,
        git:
          git.outcome === 'kept'
            ? { installationId: git.installationId }
            : git.outcome === 'dropped'
              ? 'drop'
              : 'none',
        monthStart: madridMonth(now).start,
      },
      check,
    );

    this.analytics.forget(project.id, [project.teamId, target.teamId]);
    void this.moveOlderAnalytics(project.id, target.teamId);
    // The databases' connection limit and the buckets' quotas follow the target's plan at the
    // next 10-minute check (CloudDatabasesService.check, CloudStorageService.sync): neither
    // service has a helper that applies one project's at once.

    const details = {
      from: project.team.slug,
      to: target.team.slug,
      monitors,
      git: git.outcome,
    };
    await this.teams.record(ctx, project.teamId, 'project.transferred_out', project.slug, details);
    await this.teams.record(ctx, target.teamId, 'project.transferred_in', project.slug, details);
    await this.tellOwners(ctx, project, target.team, git.outcome === 'dropped');

    const moved = await this.cloud.findProject(project.id);
    const view = this.projects.view(
      moved ?? { ...project, teamId: target.teamId, team: target.team },
    );
    return { ...view, git: git.outcome };
  }

  /** Throws when the move can't happen (the order of architecture 4.13). */
  private check(state: TransferState, teams: TransferTeams, gitRepoId: bigint | null): void {
    const project = state.project;
    if (
      !project ||
      project.deletedAt ||
      project.suspendedAt ||
      project.teamId !== teams.fromTeamId ||
      project.gitRepoId !== gitRepoId
    ) {
      throw new ConflictException('The project changed; try again');
    }
    if (!state.sourceRole) throw new NotFoundException('Not found');
    if (state.sourceRole !== 'OWNER') throw new ForbiddenException('Only a team owner can do this');
    if (!state.targetRole || !state.targetPlan) throw new NotFoundException('Team not found');
    if (ROLE_RANK[state.targetRole] < ROLE_RANK.ADMIN) {
      throw new ForbiddenException('Only a team admin can do this');
    }
    if (state.activeBuilds > 0) {
      throw new ConflictException("Wait for the project's builds to finish");
    }
    const limits = CLOUD_PLANS[state.targetPlan];
    if (state.targetProjects + 1 > limits.projectsPerTeam) {
      throw new ConflictException(`A team has at most ${limits.projectsPerTeam} projects`);
    }
    if (
      state.projectStorageBytes > 0 &&
      state.targetStorageBytes + state.projectStorageBytes > limits.storageBytesPerTeam
    ) {
      const free = megabytes(limits.storageBytesPerTeam - state.targetStorageBytes, 'down');
      const size = megabytes(state.projectStorageBytes, 'up');
      throw new ConflictException(
        `The team has ${free} MB of storage left; this project's deployments take ${size} MB`,
      );
    }
    if (
      state.monitors.length > 0 &&
      state.targetMonitors + state.monitors.length > limits.monitorsPerTeam
    ) {
      throw new ConflictException(`A team has at most ${limits.monitorsPerTeam} monitors`);
    }
  }

  /**
   * The Git link stays only when one of the target team's installations (not suspended) sees the
   * repository; GitHub not set up or not answering counts as not seen.
   */
  private async gitTarget(
    project: ProjectRow,
    teamId: string,
  ): Promise<{ outcome: 'kept'; installationId: bigint } | { outcome: 'dropped' | 'none' }> {
    if (project.gitRepoId === null) return { outcome: 'none' };
    if (!this.github.configured) return { outcome: 'dropped' };
    for (const installation of await this.builds.installations(teamId)) {
      if (installation.suspendedAt) continue;
      try {
        const repos = await this.github.repositories(installation.installationId);
        if (repos.some((repo) => BigInt(repo.id) === project.gitRepoId)) {
          return { outcome: 'kept', installationId: installation.installationId };
        }
      } catch (error) {
        this.logger.warn(
          `Installation ${installation.installationId}'s repositories couldn't be read: ${String(error)}`,
        );
      }
    }
    return { outcome: 'dropped' };
  }

  /** Older analytics events, in batches after the move (only the month's count by team). */
  private async moveOlderAnalytics(projectId: string, teamId: string): Promise<void> {
    try {
      let moved: number;
      do {
        moved = await this.repository.moveAnalyticsBatch(projectId, teamId, ANALYTICS_BATCH);
      } while (moved > 0);
    } catch (error) {
      this.logger.error(
        `Project ${projectId}: older analytics events still name its old team: ${String(error)}`,
      );
    }
  }

  private async tellOwners(
    ctx: CloudCtx,
    project: ProjectRow,
    team: { id: string; slug: string; name: string },
    gitDropped: boolean,
  ): Promise<void> {
    try {
      for (const owner of await this.cloud.ownerEmails(team.id)) {
        if (owner.id === ctx.user.id) continue;
        const locale = toApiLocale(owner.locale);
        await this.mail.send(
          cloudProjectTransferredEmail({
            to: owner.email,
            locale,
            movedBy: ctx.user.name || ctx.user.email,
            project: project.name,
            from: project.team.name,
            team: team.name,
            address: this.projects.projectUrl(project.slug),
            gitDropped,
            url: `${this.config.cloudUrl}/${locale}/console/${team.slug}/${project.slug}`,
            siteUrl: this.config.siteUrl,
          }),
        );
      }
    } catch (error) {
      this.logger.error(`Project ${project.id}: the move email couldn't be sent: ${String(error)}`);
    }
  }
}
