import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CloudApi } from '../../common/decorators/cloud-api.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import {
  idParamSchema,
  localeQuerySchema,
  paginationSchema,
  type IdParam,
  type LocaleQuery,
  type PaginationQuery,
} from '../../common/schemas/common.schemas.js';
import type { Paginated } from '../../common/types/paginated.js';
import { attachmentDisposition } from '../projects/project-file-name.js';
import { Caller, type CloudCtx } from './cloud-caller.js';
import { MAX_UPLOAD_BYTES } from './cloud-plans.js';
import {
  createDomainSchema,
  createProjectSchema,
  createTeamSchema,
  createTokenSchema,
  deploymentFieldsSchema,
  deploymentParamSchema,
  deviceDecisionSchema,
  devicePollSchema,
  deviceStartSchema,
  domainParamSchema,
  inviteParamSchema,
  inviteSchema,
  inviteTokenParamSchema,
  memberParamSchema,
  memberRoleSchema,
  reportSchema,
  teamParamSchema,
  termsSchema,
  updateProjectSchema,
  updateTeamSchema,
  userCodeParamSchema,
  type CreateDomainInput,
  type CreateProjectInput,
  type CreateTeamInput,
  type CreateTokenInput,
  type DeploymentFields,
  type DeploymentParam,
  type DeviceDecisionInput,
  type DevicePollInput,
  type DeviceStartInput,
  type DomainParam,
  type InviteInput,
  type InviteParam,
  type InviteTokenParam,
  type MemberParam,
  type MemberRoleInput,
  type ReportInput,
  type TeamParam,
  type TermsInput,
  type UpdateProjectInput,
  type UpdateTeamInput,
  type UserCodeParam,
} from './cloud.schemas.js';
import { CloudAdminService } from './cloud-admin.service.js';
import { CloudDomainsService, type DomainView } from './cloud-domains.service.js';
import {
  CloudProjectsService,
  type DeploymentView,
  type ProjectView,
} from './cloud-projects.service.js';
import {
  CloudTeamsService,
  type EventView,
  type InviteView,
  type MembersView,
  type MeView,
  type TeamView,
  type UsageView,
} from './cloud-teams.service.js';
import {
  CloudTokensService,
  type DevicePoll,
  type DeviceStart,
  type DeviceView,
  type TokenView,
} from './cloud-tokens.service.js';

/** The CLI's sign-in and the public abuse form: no session. */
@ApiTags('cloud')
@Public()
@Controller('cloud')
export class CloudPublicController {
  constructor(
    private readonly tokens: CloudTokensService,
    private readonly admin: CloudAdminService,
  ) {}

  @Post('cli/device')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  startDevice(
    @Body({ schema: deviceStartSchema }) body: DeviceStartInput,
    @Query({ schema: localeQuerySchema }) query: LocaleQuery,
  ): Promise<DeviceStart> {
    return this.tokens.startDevice(body.clientName, query.locale);
  }

  @Post('cli/device/token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  poll(@Body({ schema: devicePollSchema }) body: DevicePollInput): Promise<DevicePoll> {
    return this.tokens.poll(body.deviceCode);
  }

  @Post('reports')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  report(@Body({ schema: reportSchema }) body: ReportInput): Promise<void> {
    return this.admin.report(body);
  }
}

/**
 * Codeqlick Cloud for signed-in people (architecture 4.13). Routes marked @CloudApi() also take
 * an API token; the rest (members, invitations, tokens, teams) need a session.
 */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('cloud')
export class CloudController {
  private readonly logger = new Logger(CloudController.name);

  constructor(
    private readonly tokens: CloudTokensService,
    private readonly teams: CloudTeamsService,
    private readonly projects: CloudProjectsService,
    private readonly domains: CloudDomainsService,
  ) {}

  // ── CLI sign-in (the person's side) ─────────────────────────────────────────────────────────

  @Get('cli/device/:userCode')
  device(@Param({ schema: userCodeParamSchema }) params: UserCodeParam): Promise<DeviceView> {
    return this.tokens.device(params.userCode);
  }

  @Post('cli/device/:userCode')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  decide(
    @Caller() ctx: CloudCtx,
    @Param({ schema: userCodeParamSchema }) params: UserCodeParam,
    @Body({ schema: deviceDecisionSchema }) body: DeviceDecisionInput,
  ): Promise<void> {
    return this.tokens.decide(ctx.user, params.userCode, body.approve);
  }

  // ── Me and tokens ───────────────────────────────────────────────────────────────────────────

  @Get('me')
  @CloudApi()
  me(@Caller() ctx: CloudCtx): Promise<MeView> {
    return this.teams.me(ctx);
  }

  @Get('tokens')
  async listTokens(@Caller() ctx: CloudCtx): Promise<{ items: TokenView[] }> {
    return { items: await this.tokens.list(ctx.user) };
  }

  @Post('tokens')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createToken(
    @Caller() ctx: CloudCtx,
    @Body({ schema: createTokenSchema }) body: CreateTokenInput,
  ): Promise<{ token: string; item: TokenView }> {
    return this.tokens.create(ctx.user, body);
  }

  @Delete('tokens/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeToken(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.tokens.revoke(ctx.user, params.id);
  }

  // ── Teams ───────────────────────────────────────────────────────────────────────────────────

  @Post('teams')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  createTeam(
    @Caller() ctx: CloudCtx,
    @Body({ schema: createTeamSchema }) body: CreateTeamInput,
  ): Promise<TeamView> {
    return this.teams.createTeam(ctx, body);
  }

  @Get('teams/:team')
  @CloudApi()
  team(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
  ): Promise<TeamView> {
    return this.teams.getTeam(ctx, params.team);
  }

  @Patch('teams/:team')
  updateTeam(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
    @Body({ schema: updateTeamSchema }) body: UpdateTeamInput,
  ): Promise<TeamView> {
    return this.teams.updateTeam(ctx, params.team, body);
  }

  @Delete('teams/:team')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTeam(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
  ): Promise<void> {
    return this.teams.deleteTeam(ctx, params.team);
  }

  @Get('teams/:team/members')
  members(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
  ): Promise<MembersView> {
    return this.teams.members(ctx, params.team);
  }

  @Post('teams/:team/invites')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  invite(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
    @Body({ schema: inviteSchema }) body: InviteInput,
  ) {
    return this.teams.invite(ctx, params.team, body);
  }

  @Delete('teams/:team/invites/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeInvite(
    @Caller() ctx: CloudCtx,
    @Param({ schema: inviteParamSchema }) params: InviteParam,
  ): Promise<void> {
    return this.teams.revokeInvite(ctx, params.team, params.id);
  }

  @Get('invites/:token')
  getInvite(
    @Caller() ctx: CloudCtx,
    @Param({ schema: inviteTokenParamSchema }) params: InviteTokenParam,
  ): Promise<InviteView> {
    return this.teams.getInvite(ctx, params.token);
  }

  @Post('invites/:token/accept')
  @HttpCode(HttpStatus.OK)
  acceptInvite(
    @Caller() ctx: CloudCtx,
    @Param({ schema: inviteTokenParamSchema }) params: InviteTokenParam,
    @Body({ schema: termsSchema }) body: TermsInput,
  ) {
    return this.teams.acceptInvite(ctx, params.token, body);
  }

  @Patch('teams/:team/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  setRole(
    @Caller() ctx: CloudCtx,
    @Param({ schema: memberParamSchema }) params: MemberParam,
    @Body({ schema: memberRoleSchema }) body: MemberRoleInput,
  ): Promise<void> {
    return this.teams.setRole(ctx, params.team, params.userId, body);
  }

  @Delete('teams/:team/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Caller() ctx: CloudCtx,
    @Param({ schema: memberParamSchema }) params: MemberParam,
  ): Promise<void> {
    return this.teams.removeMember(ctx, params.team, params.userId);
  }

  @Get('teams/:team/usage')
  @CloudApi()
  usage(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
  ): Promise<UsageView> {
    return this.teams.usage(ctx, params.team);
  }

  @Get('teams/:team/events')
  @CloudApi()
  events(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
    @Query({ schema: paginationSchema }) query: PaginationQuery,
  ): Promise<Paginated<EventView>> {
    return this.teams.events(ctx, params.team, query.page, query.pageSize);
  }

  // ── Projects ────────────────────────────────────────────────────────────────────────────────

  @Get('teams/:team/projects')
  @CloudApi()
  async projectsOf(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
  ): Promise<{ items: ProjectView[] }> {
    return { items: await this.projects.list(ctx, params.team) };
  }

  @Post('teams/:team/projects')
  @CloudApi()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createProject(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
    @Body({ schema: createProjectSchema }) body: CreateProjectInput,
  ): Promise<ProjectView> {
    return this.projects.create(ctx, params.team, body);
  }

  @Get('projects/:id')
  @CloudApi()
  project(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<ProjectView> {
    return this.projects.get(ctx, params.id);
  }

  @Patch('projects/:id')
  @CloudApi()
  updateProject(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updateProjectSchema }) body: UpdateProjectInput,
  ): Promise<ProjectView> {
    return this.projects.update(ctx, params.id, body);
  }

  @Delete('projects/:id')
  @CloudApi()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProject(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.projects.remove(ctx, params.id);
  }

  // ── Deployments ─────────────────────────────────────────────────────────────────────────────

  @Get('projects/:id/deployments')
  @CloudApi()
  deployments(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: paginationSchema }) query: PaginationQuery,
  ): Promise<Paginated<DeploymentView>> {
    return this.projects.deployments(ctx, params.id, query.page, query.pageSize);
  }

  /** Uploads a built folder (`bundle`, tar.gz) as a new deployment. */
  @Post('projects/:id/deployments')
  @CloudApi()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('bundle', {
      dest: join(tmpdir(), 'cloud-uploads'),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10 },
    }),
  )
  deploy(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: deploymentFieldsSchema }) body: DeploymentFields,
    @UploadedFile() file: { path: string } | undefined,
  ): Promise<DeploymentView> {
    return this.projects.deploy(ctx, params.id, file?.path, body);
  }

  @Get('projects/:id/deployments/:deploymentId')
  @CloudApi()
  deployment(
    @Caller() ctx: CloudCtx,
    @Param({ schema: deploymentParamSchema }) params: DeploymentParam,
  ): Promise<DeploymentView> {
    return this.projects.deployment(ctx, params.id, params.deploymentId);
  }

  @Delete('projects/:id/deployments/:deploymentId')
  @CloudApi()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDeployment(
    @Caller() ctx: CloudCtx,
    @Param({ schema: deploymentParamSchema }) params: DeploymentParam,
  ): Promise<void> {
    return this.projects.removeDeployment(ctx, params.id, params.deploymentId);
  }

  @Post('projects/:id/deployments/:deploymentId/promote')
  @CloudApi()
  @HttpCode(HttpStatus.OK)
  promote(
    @Caller() ctx: CloudCtx,
    @Param({ schema: deploymentParamSchema }) params: DeploymentParam,
  ): Promise<ProjectView> {
    return this.projects.promote(ctx, params.id, params.deploymentId);
  }

  /** The deployment's files as a `tar.gz` built while it streams (decision 60). */
  @Get('projects/:id/deployments/:deploymentId/archive')
  @CloudApi()
  @Header('Cache-Control', 'private, no-store')
  async archive(
    @Caller() ctx: CloudCtx,
    @Param({ schema: deploymentParamSchema }) params: DeploymentParam,
  ): Promise<StreamableFile> {
    const archive = await this.projects.archive(ctx, params.id, params.deploymentId);
    return new StreamableFile(archive.stream, {
      type: 'application/gzip',
      disposition: attachmentDisposition(archive.filename),
    })
      .setErrorHandler((error, response) => {
        // Headers are gone by now: cut the connection so the archive can't look complete. A
        // reader who went away is ordinary; anything else (files gone mid-way) is worth a line.
        const code = (error as NodeJS.ErrnoException).code;
        if (
          code !== 'ERR_STREAM_PREMATURE_CLOSE' &&
          code !== 'ECONNRESET' &&
          !/aborted/i.test(error.message)
        ) {
          this.logger.warn(`Archive of ${params.deploymentId} cut: ${error.message}`);
        }
        (response as unknown as { destroy(): void }).destroy();
      })
      .setErrorLogger(() => undefined);
  }

  // ── Domains ─────────────────────────────────────────────────────────────────────────────────

  @Get('projects/:id/domains')
  @CloudApi()
  async domainsOf(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<{ items: DomainView[] }> {
    return { items: await this.domains.list(ctx, params.id) };
  }

  @Post('projects/:id/domains')
  @CloudApi()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  addDomain(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createDomainSchema }) body: CreateDomainInput,
  ): Promise<DomainView> {
    return this.domains.add(ctx, params.id, body);
  }

  @Post('projects/:id/domains/:domainId/check')
  @CloudApi()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  checkDomain(
    @Caller() ctx: CloudCtx,
    @Param({ schema: domainParamSchema }) params: DomainParam,
  ): Promise<DomainView> {
    return this.domains.check(ctx, params.id, params.domainId);
  }

  @Delete('projects/:id/domains/:domainId')
  @CloudApi()
  @HttpCode(HttpStatus.NO_CONTENT)
  removeDomain(
    @Caller() ctx: CloudCtx,
    @Param({ schema: domainParamSchema }) params: DomainParam,
  ): Promise<void> {
    return this.domains.remove(ctx, params.id, params.domainId);
  }
}
