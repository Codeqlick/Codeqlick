import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CloudApi } from '../../common/decorators/cloud-api.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import { CloudAnalyticsService, type AnalyticsReport } from './cloud-analytics.service.js';
import { Caller, type CloudCtx } from './cloud-caller.js';
import {
  analyticsQuerySchema,
  analyticsSwitchSchema,
  type AnalyticsQuery,
  type AnalyticsSwitchInput,
} from './cloud.schemas.js';

/** The tracker and the endpoint sites send their visits to (architecture 4.13 "Web analytics"). */
@ApiTags('cloud')
@Public()
@Controller('cloud/analytics')
export class CloudAnalyticsPublicController {
  constructor(private readonly analytics: CloudAnalyticsService) {}

  @Get('script.js')
  @SkipThrottle()
  script(@Res() res: Response): void {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.send(this.analytics.script());
  }

  /** Always 202: nobody learns which addresses count. */
  @Post('event')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async event(
    @Body() body: unknown,
    @Headers('origin') origin: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ip: string,
  ): Promise<void> {
    await this.analytics.hit({ body, origin, userAgent, ip });
  }
}

/** A project's analytics, for its team (session or API token). */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@CloudApi()
@Controller('cloud/projects/:id/analytics')
export class CloudAnalyticsController {
  constructor(private readonly analytics: CloudAnalyticsService) {}

  @Get()
  report(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: analyticsQuerySchema }) query: AnalyticsQuery,
  ): Promise<AnalyticsReport> {
    return this.analytics.report(ctx, params.id, query.period);
  }

  @Patch()
  update(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: analyticsSwitchSchema }) body: AnalyticsSwitchInput,
  ): Promise<{ enabled: boolean; snippet: string }> {
    return this.analytics.setEnabled(ctx, params.id, body.enabled);
  }
}
