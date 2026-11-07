import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { VideochatGateway } from './videochat.gateway.js';
import {
  reportsQuerySchema,
  suspendSchema,
  userIdParamSchema,
  type ReportsQuery,
  type SuspendInput,
  type UserIdParam,
} from './videochat.schemas.js';
import { VideochatService, type ReportView, type SuspensionView } from './videochat.service.js';

/** Moderation of the video chat: reports and suspensions. */
@ApiTags('admin: videochat')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/videochat')
export class VideochatAdminController {
  constructor(
    private readonly videochat: VideochatService,
    private readonly gateway: VideochatGateway,
  ) {}

  /** People online, waiting and in a call right now. */
  @Get('stats')
  stats(): { online: number; waiting: number; calls: number } {
    return this.gateway.stats;
  }

  @Get('reports')
  reports(@Query({ schema: reportsQuerySchema }) query: ReportsQuery): Promise<ReportView[]> {
    return this.videochat.listReports(query.status);
  }

  @Post('reports/:id/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  dismiss(
    @CurrentUser() admin: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.videochat.dismissReport(admin, params.id);
  }

  /** Suspends the reported account from the video chat (disconnected at once). */
  @Post('reports/:id/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  suspend(
    @CurrentUser() admin: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: suspendSchema }) body: SuspendInput,
  ): Promise<void> {
    return this.videochat.suspendFromReport(admin, params.id, body.reason);
  }

  /** The team checked this person's age by hand (needed when VIDEOCHAT_AGE_VERIFICATION_REQUIRED is on). */
  @Put('users/:userId/age-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  verifyAge(@Param({ schema: userIdParamSchema }) params: UserIdParam): Promise<void> {
    return this.videochat.setAgeVerified(params.userId, true);
  }

  @Delete('users/:userId/age-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  unverifyAge(@Param({ schema: userIdParamSchema }) params: UserIdParam): Promise<void> {
    return this.videochat.setAgeVerified(params.userId, false);
  }

  @Get('suspensions')
  suspensions(): Promise<SuspensionView[]> {
    return this.videochat.listSuspensions();
  }

  @Delete('suspensions/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  lift(@Param({ schema: userIdParamSchema }) params: UserIdParam): Promise<void> {
    return this.videochat.liftSuspension(params.userId);
  }
}
