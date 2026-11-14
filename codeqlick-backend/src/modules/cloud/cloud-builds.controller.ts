import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CloudApi } from '../../common/decorators/cloud-api.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import {
  idParamSchema,
  paginationSchema,
  type IdParam,
  type PaginationQuery,
} from '../../common/schemas/common.schemas.js';
import type { Paginated } from '../../common/types/paginated.js';
import { Caller, type CloudCtx } from './cloud-caller.js';
import { MAX_UPLOAD_BYTES } from './cloud-plans.js';
import {
  buildParamSchema,
  builderBuildParamSchema,
  claimSchema,
  envKeyQuerySchema,
  envVarSchema,
  finishSchema,
  gitSettingsSchema,
  installUrlQuerySchema,
  linkInstallationSchema,
  logQuerySchema,
  manualBuildSchema,
  reposQuerySchema,
  teamParamSchema,
  type BuildParam,
  type BuilderBuildParam,
  type ClaimInput,
  type EnvKeyQuery,
  type EnvVarInput,
  type FinishInput,
  type GitSettingsInput,
  type InstallUrlQuery,
  type LinkInstallationInput,
  type LogQuery,
  type ManualBuildInput,
  type ReposQuery,
  type TeamParam,
} from './cloud.schemas.js';
import {
  CloudBuildsService,
  type BuildDetail,
  type BuildView,
  type ClaimedBuild,
  type GitView,
} from './cloud-builds.service.js';

/** GitHub's webhook and the build server's agent: no session (architecture 4.13, 8.4). */
@ApiTags('cloud')
@Public()
@Controller('cloud')
export class CloudBuildsPublicController {
  constructor(private readonly builds: CloudBuildsService) {}

  @Post('github/webhook')
  @SkipThrottle()
  @HttpCode(HttpStatus.ACCEPTED)
  async webhook(
    @Req() request: Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Headers('x-github-event') event: string | undefined,
    @Headers('x-github-delivery') delivery: string | undefined,
    @Body() body: Record<string, unknown>,
  ): Promise<void> {
    this.builds.checkSignature(request.rawBody, signature);
    await this.builds.webhook(event, delivery, body ?? {});
  }

  @Post('builder/claim')
  @SkipThrottle()
  async claim(
    @Headers('authorization') authorization: string | undefined,
    @Body({ schema: claimSchema }) body: ClaimInput,
    @Res() res: Response,
  ): Promise<void> {
    this.builds.checkBuilder(authorization);
    const build: ClaimedBuild | null = await this.builds.claim(body.builder);
    if (build) res.status(200).json({ build });
    else res.status(204).end();
  }

  @Post('builder/builds/:id/log')
  @SkipThrottle()
  @HttpCode(HttpStatus.NO_CONTENT)
  async log(
    @Headers('authorization') authorization: string | undefined,
    @Param({ schema: builderBuildParamSchema }) params: BuilderBuildParam,
    @Body() body: { text?: unknown },
  ): Promise<void> {
    this.builds.checkBuilder(authorization);
    await this.builds.log(params.id, typeof body?.text === 'string' ? body.text : '');
  }

  @Post('builder/builds/:id/heartbeat')
  @SkipThrottle()
  @HttpCode(HttpStatus.NO_CONTENT)
  async heartbeat(
    @Headers('authorization') authorization: string | undefined,
    @Param({ schema: builderBuildParamSchema }) params: BuilderBuildParam,
  ): Promise<void> {
    this.builds.checkBuilder(authorization);
    await this.builds.heartbeat(params.id);
  }

  @Post('builder/builds/:id/finish')
  @SkipThrottle()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseInterceptors(
    FileInterceptor('bundle', {
      dest: join(tmpdir(), 'cloud-builds'),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 5 },
    }),
  )
  async finish(
    @Headers('authorization') authorization: string | undefined,
    @Param({ schema: builderBuildParamSchema }) params: BuilderBuildParam,
    @Body({ schema: finishSchema }) body: FinishInput,
    @UploadedFile() file: { path: string } | undefined,
  ): Promise<void> {
    this.builds.checkBuilder(authorization);
    await this.builds.finish(params.id, body, file?.path);
  }
}

/** Connecting GitHub, a project's build settings, variables and builds (session or token). */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('cloud')
export class CloudBuildsController {
  constructor(private readonly builds: CloudBuildsService) {}

  @Get('github/install-url')
  installUrl(
    @Caller() ctx: CloudCtx,
    @Query({ schema: installUrlQuerySchema }) query: InstallUrlQuery,
  ) {
    return this.builds.installUrl(ctx, query.teamSlug, query.projectSlug);
  }

  @Post('github/installations')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  link(
    @Caller() ctx: CloudCtx,
    @Body({ schema: linkInstallationSchema }) body: LinkInstallationInput,
  ) {
    return this.builds.link(ctx, body);
  }

  @Get('teams/:team/github')
  @CloudApi()
  teamGithub(@Caller() ctx: CloudCtx, @Param({ schema: teamParamSchema }) params: TeamParam) {
    return this.builds.teamGithub(ctx, params.team);
  }

  @Get('teams/:team/github/repos')
  @CloudApi()
  repos(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
    @Query({ schema: reposQuerySchema }) query: ReposQuery,
  ) {
    return this.builds.repos(ctx, params.team, query.installationId);
  }

  @Get('projects/:id/git')
  @CloudApi()
  git(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<GitView> {
    return this.builds.git(ctx, params.id);
  }

  @Put('projects/:id/git')
  @CloudApi()
  setGit(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: gitSettingsSchema }) body: GitSettingsInput,
  ): Promise<GitView> {
    return this.builds.setGit(ctx, params.id, body);
  }

  @Delete('projects/:id/git')
  @CloudApi()
  @HttpCode(HttpStatus.NO_CONTENT)
  disconnect(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.builds.disconnect(ctx, params.id);
  }

  @Get('projects/:id/env')
  @CloudApi()
  env(@Caller() ctx: CloudCtx, @Param({ schema: idParamSchema }) params: IdParam) {
    return this.builds.envVars(ctx, params.id);
  }

  @Put('projects/:id/env')
  @CloudApi()
  setEnv(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: envVarSchema }) body: EnvVarInput,
  ) {
    return this.builds.setEnvVar(ctx, params.id, body);
  }

  @Delete('projects/:id/env')
  @CloudApi()
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteEnv(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: envKeyQuerySchema }) query: EnvKeyQuery,
  ): Promise<void> {
    return this.builds.deleteEnvVar(ctx, params.id, query.key);
  }

  @Get('projects/:id/builds')
  @CloudApi()
  list(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: paginationSchema }) query: PaginationQuery,
  ): Promise<Paginated<BuildView>> {
    return this.builds.list(ctx, params.id, query.page, query.pageSize);
  }

  @Post('projects/:id/builds')
  @CloudApi()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  manual(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: manualBuildSchema }) body: ManualBuildInput,
  ): Promise<BuildView> {
    return this.builds.manual(ctx, params.id, body.branch, body.noCache);
  }

  @Get('projects/:id/builds/:number')
  @CloudApi()
  get(
    @Caller() ctx: CloudCtx,
    @Param({ schema: buildParamSchema }) params: BuildParam,
    @Query({ schema: logQuerySchema }) query: LogQuery,
  ): Promise<BuildDetail> {
    return this.builds.get(ctx, params.id, params.number, query.after);
  }

  @Post('projects/:id/builds/:number/cancel')
  @CloudApi()
  @HttpCode(HttpStatus.OK)
  cancel(
    @Caller() ctx: CloudCtx,
    @Param({ schema: buildParamSchema }) params: BuildParam,
  ): Promise<BuildView> {
    return this.builds.cancel(ctx, params.id, params.number);
  }
}
