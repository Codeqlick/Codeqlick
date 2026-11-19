import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CloudApi } from '../../common/decorators/cloud-api.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import {
  idParamSchema,
  localeQuerySchema,
  type IdParam,
  type LocaleQuery,
} from '../../common/schemas/common.schemas.js';
import { Caller, type CloudCtx } from './cloud-caller.js';
import { domainParamSchema, type DomainParam } from './cloud.schemas.js';
import {
  CloudSurfaceService,
  type SurfaceScanView,
  type SurfaceView,
} from './cloud-surface.service.js';

/** The Surface monitor's history and scans (architecture 4.13, decision 144). */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@CloudApi()
@Controller('cloud')
export class CloudSurfaceController {
  constructor(private readonly surface: CloudSurfaceService) {}

  @Get('projects/:id/domains/:domainId/surface')
  history(
    @Caller() ctx: CloudCtx,
    @Param({ schema: domainParamSchema }) params: DomainParam,
  ): Promise<SurfaceView> {
    return this.surface.history(ctx, params.id, params.domainId);
  }

  @Get('surface-scans/:id')
  scan(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: localeQuerySchema }) query: LocaleQuery,
  ): Promise<SurfaceScanView> {
    return this.surface.scan(ctx, params.id, query.locale);
  }
}
