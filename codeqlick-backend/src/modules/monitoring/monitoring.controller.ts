import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { MonitoringService, type MonitorView } from './monitoring.service.js';

const monitorSchema = z.object({ enabled: z.boolean() }).strict();

@ApiTags('monitoring')
@ApiBearerAuth()
@Controller()
export class MonitoringController {
  constructor(private readonly monitoring: MonitoringService) {}

  @Roles('ADMIN')
  @Get('admin/monitoring')
  list(): Promise<MonitorView[]> {
    return this.monitoring.list();
  }

  @Roles('ADMIN')
  @Get('admin/projects/:id/monitor')
  async get(
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<MonitorView | { enabled: false }> {
    return (await this.monitoring.getForTeam(params.id)) ?? { enabled: false };
  }

  @Roles('ADMIN')
  @Put('admin/projects/:id/monitor')
  set(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: monitorSchema }) body: { enabled: boolean },
  ): Promise<MonitorView> {
    return this.monitoring.setEnabled(user, params.id, body.enabled);
  }

  @Roles('ADMIN')
  @Post('admin/projects/:id/monitor/check')
  @HttpCode(HttpStatus.OK)
  checkNow(@Param({ schema: idParamSchema }) params: IdParam): Promise<MonitorView> {
    return this.monitoring.checkNow(params.id);
  }

  @Roles('CLIENT', 'ADMIN')
  @Get('portal/projects/:id/status')
  forClient(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<MonitorView> {
    return this.monitoring.getForClient(user, params.id);
  }
}
