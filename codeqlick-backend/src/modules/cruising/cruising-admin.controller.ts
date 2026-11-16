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
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  adminSpotSchema,
  adminSpotsQuerySchema,
  importSpotsSchema,
  rejectSpotSchema,
  reportActionSchema,
  reportsQuerySchema,
  spotPatchSchema,
  suspendUserSchema,
  takedownDecisionSchema,
  takedownsQuerySchema,
  userIdParamSchema,
  type AdminSpotInput,
  type AdminSpotsQuery,
  type ImportSpotsInput,
  type RejectSpotInput,
  type ReportActionInput,
  type ReportsQuery,
  type SpotPatch,
  type SuspendUserInput,
  type TakedownDecision,
  type TakedownsQuery,
  type UserIdParam,
} from './cruising.schemas.js';
import { CruisingService, type ImportResult } from './cruising.service.js';

/** Cruising's moderation: spots to review, reports, removal requests and suspensions. */
@ApiTags('admin: cruising')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/cruising')
export class CruisingAdminController {
  constructor(private readonly cruising: CruisingService) {}

  @Get('overview')
  overview() {
    return this.cruising.overview();
  }

  @Get('spots')
  async spots(@Query({ schema: adminSpotsQuerySchema }) query: AdminSpotsQuery) {
    return { items: await this.cruising.adminSpots(query.status, query.q) };
  }

  /** A team spot (decision 84): LIVE at once, or PENDING with `publish: false`. */
  @Post('spots')
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: adminSpotSchema }) body: AdminSpotInput,
  ): Promise<{ id: string; slug: string; status: 'LIVE' | 'PENDING' }> {
    return this.cruising.createTeamSpot(user, body);
  }

  /** A CSV or GeoJSON file of spots (decision 84), or its dry run. */
  @Post('spots/import')
  @HttpCode(HttpStatus.OK)
  import(
    @CurrentUser() user: AuthUser,
    @Body({ schema: importSpotsSchema }) body: ImportSpotsInput,
  ): Promise<ImportResult> {
    return this.cruising.importSpots(user, body);
  }

  @Patch('spots/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  correct(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: spotPatchSchema }) body: SpotPatch,
  ): Promise<void> {
    return this.cruising.correctSpot(user, params.id, body);
  }

  @Post('spots/:id/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  approve(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.cruising.approveSpot(user, params.id);
  }

  @Post('spots/:id/hide')
  @HttpCode(HttpStatus.NO_CONTENT)
  hide(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.cruising.hideSpot(user, params.id);
  }

  @Post('spots/:id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  reject(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: rejectSpotSchema }) body: RejectSpotInput,
  ): Promise<void> {
    return this.cruising.rejectSpot(user, params.id, body.reason);
  }

  @Get('reports')
  async reports(@Query({ schema: reportsQuerySchema }) query: ReportsQuery) {
    return { items: await this.cruising.reports(query.status) };
  }

  @Post('reports/:id/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  dismiss(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.cruising.dismissReport(user, params.id);
  }

  @Post('reports/:id/action')
  @HttpCode(HttpStatus.NO_CONTENT)
  act(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: reportActionSchema }) body: ReportActionInput,
  ): Promise<void> {
    return this.cruising.actOnReport(user, params.id, body);
  }

  @Get('takedowns')
  async takedowns(@Query({ schema: takedownsQuerySchema }) query: TakedownsQuery) {
    return { items: await this.cruising.takedowns(query.status) };
  }

  @Post('takedowns/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  decideTakedown(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: takedownDecisionSchema }) body: TakedownDecision,
  ): Promise<void> {
    return this.cruising.decideTakedown(user, params.id, body);
  }

  @Get('suspensions')
  async suspensions() {
    return { items: await this.cruising.suspensions() };
  }

  @Post('users/:userId/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  suspend(
    @CurrentUser() user: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
    @Body({ schema: suspendUserSchema }) body: SuspendUserInput,
  ): Promise<void> {
    return this.cruising.suspend(user, params.userId, body);
  }

  @Delete('users/:userId/suspension')
  @HttpCode(HttpStatus.NO_CONTENT)
  unsuspend(
    @CurrentUser() user: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
  ): Promise<void> {
    return this.cruising.unsuspend(user, params.userId);
  }
}
