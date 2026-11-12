import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CloudApi } from '../../common/decorators/cloud-api.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import { Caller, type CloudCtx } from './cloud-caller.js';
import {
  createMonitorSchema,
  heartbeatParamSchema,
  heartbeatQuerySchema,
  statusPageSchema,
  statusTeamParamSchema,
  teamParamSchema,
  updateMonitorSchema,
  type CreateMonitorInput,
  type HeartbeatParam,
  type HeartbeatQuery,
  type StatusPageInput,
  type TeamParam,
  type UpdateMonitorInput,
} from './cloud.schemas.js';
import {
  CloudMonitorsService,
  type MonitorDetail,
  type MonitorView,
  type PublicStatus,
  type StatusPageSettings,
} from './cloud-monitors.service.js';

/** Heartbeats and status pages: called by anyone's jobs and pages (architecture 4.13). */
@ApiTags('cloud')
@Public()
@Controller('cloud')
export class CloudMonitorsPublicController {
  constructor(private readonly monitors: CloudMonitorsService) {}

  @Get('heartbeats/:key')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  pingGet(
    @Param({ schema: heartbeatParamSchema }) params: HeartbeatParam,
    @Query({ schema: heartbeatQuerySchema }) query: HeartbeatQuery,
  ): Promise<{ ok: true }> {
    return this.monitors.ping(params.key, query.status === 'fail');
  }

  @Post('heartbeats/:key')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  pingPost(
    @Param({ schema: heartbeatParamSchema }) params: HeartbeatParam,
    @Query({ schema: heartbeatQuerySchema }) query: HeartbeatQuery,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    const failed =
      query.status === 'fail' ||
      (!!body && typeof body === 'object' && (body as { status?: unknown }).status === 'fail');
    return this.monitors.ping(params.key, failed);
  }

  @Get('status/:team')
  async status(
    @Param({ schema: statusTeamParamSchema }) params: TeamParam,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicStatus> {
    const value = await this.monitors.publicStatus(params.team);
    res.setHeader('Cache-Control', 'public, max-age=60');
    return value;
  }

  @Get('status/:team/badge.svg')
  async badge(
    @Param({ schema: statusTeamParamSchema }) params: TeamParam,
    @Res() res: Response,
  ): Promise<void> {
    const svg = await this.monitors.badge(params.team);
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    // Shown as an <img> on other sites (READMEs): helmet's same-origin default would block it.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(svg);
  }
}

/** A team's monitors and its status page settings (session or API token). */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@CloudApi()
@Controller('cloud')
export class CloudMonitorsController {
  constructor(private readonly monitors: CloudMonitorsService) {}

  @Get('teams/:team/monitors')
  async list(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
  ): Promise<{ items: MonitorView[] }> {
    return { items: await this.monitors.list(ctx, params.team) };
  }

  @Post('teams/:team/monitors')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
    @Body({ schema: createMonitorSchema }) body: CreateMonitorInput,
  ): Promise<MonitorView> {
    return this.monitors.create(ctx, params.team, body);
  }

  @Get('monitors/:id')
  detail(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<MonitorDetail> {
    return this.monitors.detail(ctx, params.id);
  }

  @Patch('monitors/:id')
  update(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updateMonitorSchema }) body: UpdateMonitorInput,
  ): Promise<MonitorView> {
    return this.monitors.update(ctx, params.id, body);
  }

  @Delete('monitors/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.monitors.remove(ctx, params.id);
  }

  @Get('teams/:team/status-page')
  statusPage(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
  ): Promise<StatusPageSettings> {
    return this.monitors.statusPage(ctx, params.team);
  }

  @Put('teams/:team/status-page')
  saveStatusPage(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
    @Body({ schema: statusPageSchema }) body: StatusPageInput,
  ): Promise<StatusPageSettings> {
    return this.monitors.saveStatusPage(ctx, params.team, body);
  }
}
