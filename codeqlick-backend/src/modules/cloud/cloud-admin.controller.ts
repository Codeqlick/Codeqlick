import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Paginated } from '../../common/types/paginated.js';
import {
  adminListSchema,
  closeReportSchema,
  reportsQuerySchema,
  suspendSchema,
  type AdminListQuery,
  type CloseReportInput,
  type ReportsQuery,
  type SuspendInput,
} from './cloud.schemas.js';
import {
  CloudAdminService,
  type AdminProjectView,
  type AdminTeamView,
  type ReportView,
} from './cloud-admin.service.js';

/** Admin → Cloud: teams, projects (suspend, lift) and abuse reports (architecture 4.13). */
@ApiTags('admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/cloud')
export class CloudAdminController {
  constructor(private readonly admin: CloudAdminService) {}

  @Get('teams')
  teams(
    @Query({ schema: adminListSchema }) query: AdminListQuery,
  ): Promise<Paginated<AdminTeamView>> {
    return this.admin.teams(query);
  }

  @Get('projects')
  projects(
    @Query({ schema: adminListSchema }) query: AdminListQuery,
  ): Promise<Paginated<AdminProjectView>> {
    return this.admin.projectsList(query);
  }

  @Post('projects/:id/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  suspend(
    @CurrentUser() admin: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: suspendSchema }) body: SuspendInput,
  ): Promise<void> {
    return this.admin.suspend(admin, params.id, body.reason);
  }

  @Delete('projects/:id/suspension')
  @HttpCode(HttpStatus.NO_CONTENT)
  unsuspend(
    @CurrentUser() admin: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.admin.unsuspend(admin, params.id);
  }

  @Get('reports')
  reports(
    @Query({ schema: reportsQuerySchema }) query: ReportsQuery,
  ): Promise<Paginated<ReportView>> {
    return this.admin.reports(query);
  }

  @Post('reports/:id/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  close(
    @CurrentUser() admin: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: closeReportSchema }) body: CloseReportInput,
  ): Promise<void> {
    return this.admin.closeReport(admin, params.id, body.note);
  }
}
