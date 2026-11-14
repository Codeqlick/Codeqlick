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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CloudApi } from '../../common/decorators/cloud-api.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { Paginated } from '../../common/types/paginated.js';
import { Caller, type CloudCtx } from './cloud-caller.js';
import {
  createStatusNoticeSchema,
  statusNoticesQuerySchema,
  statusNoticeUpdateSchema,
  teamParamSchema,
  updateStatusNoticeSchema,
  type CreateStatusNoticeInput,
  type StatusNoticesQuery,
  type StatusNoticeUpdateInput,
  type TeamParam,
  type UpdateStatusNoticeInput,
} from './cloud.schemas.js';
import {
  CloudStatusNoticesService,
  type StatusNoticeView,
} from './cloud-status-notices.service.js';

/** A team's status page notices: incidents and scheduled maintenance (session or API token). */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@CloudApi()
@Controller('cloud')
export class CloudStatusNoticesController {
  constructor(private readonly notices: CloudStatusNoticesService) {}

  @Get('teams/:team/status-notices')
  list(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
    @Query({ schema: statusNoticesQuerySchema }) query: StatusNoticesQuery,
  ): Promise<Paginated<StatusNoticeView>> {
    return this.notices.list(ctx, params.team, query);
  }

  @Post('teams/:team/status-notices')
  create(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
    @Body({ schema: createStatusNoticeSchema }) body: CreateStatusNoticeInput,
  ): Promise<StatusNoticeView> {
    return this.notices.create(ctx, params.team, body);
  }

  @Get('status-notices/:id')
  get(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<StatusNoticeView> {
    return this.notices.get(ctx, params.id);
  }

  @Patch('status-notices/:id')
  update(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updateStatusNoticeSchema }) body: UpdateStatusNoticeInput,
  ): Promise<StatusNoticeView> {
    return this.notices.update(ctx, params.id, body);
  }

  @Delete('status-notices/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.notices.remove(ctx, params.id);
  }

  @Post('status-notices/:id/updates')
  addUpdate(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: statusNoticeUpdateSchema }) body: StatusNoticeUpdateInput,
  ): Promise<StatusNoticeView> {
    return this.notices.addUpdate(ctx, params.id, body);
  }
}
