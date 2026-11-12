import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CloudApi } from '../../common/decorators/cloud-api.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import {
  idParamSchema,
  localeQuerySchema,
  paginationSchema,
  type IdParam,
  type LocaleQuery,
  type PaginationQuery,
} from '../../common/schemas/common.schemas.js';
import { Caller, type CloudCtx } from './cloud-caller.js';
import {
  runAuditSchema,
  teamParamSchema,
  type RunAuditInput,
  type TeamParam,
} from './cloud.schemas.js';
import { CloudAuditsService, type CloudAuditReport } from './cloud-audits.service.js';

/** The website check for developers (architecture 4.13, Website check API). */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@CloudApi()
@Controller('cloud')
export class CloudAuditsController {
  constructor(private readonly audits: CloudAuditsService) {}

  @Post('audits')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  run(
    @Caller() ctx: CloudCtx,
    @Body({ schema: runAuditSchema }) body: RunAuditInput,
  ): Promise<CloudAuditReport> {
    return this.audits.run(ctx, body);
  }

  @Get('teams/:team/audits')
  list(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
    @Query({ schema: paginationSchema }) query: PaginationQuery,
  ) {
    return this.audits.list(ctx, params.team, query.page, query.pageSize);
  }

  @Get('audits/:id')
  get(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: localeQuerySchema }) query: LocaleQuery,
  ): Promise<CloudAuditReport> {
    return this.audits.get(ctx, params.id, query.locale);
  }
}
