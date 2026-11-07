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
import { VideochatStatsService, type VideochatHistory } from './videochat-stats.service.js';
import { VideochatGateway } from './videochat.gateway.js';
import {
  appealDecisionSchema,
  appealsQuerySchema,
  historyQuerySchema,
  reportsQuerySchema,
  suspendSchema,
  suspendUserSchema,
  userIdParamSchema,
  type AppealDecisionInput,
  type AppealsQuery,
  type HistoryQuery,
  type ReportsQuery,
  type SuspendInput,
  type SuspendUserInput,
  type UserIdParam,
} from './videochat.schemas.js';
import {
  VideochatService,
  type AppealView,
  type ReportView,
  type SuspensionView,
  type UserDetailView,
} from './videochat.service.js';

/** Moderation of the video chat: reports and suspensions. */
@ApiTags('admin: videochat')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/videochat')
export class VideochatAdminController {
  constructor(
    private readonly videochat: VideochatService,
    private readonly gateway: VideochatGateway,
    private readonly statistics: VideochatStatsService,
  ) {}

  /** People online, waiting and in a call right now. */
  @Get('stats')
  stats(): { online: number; waiting: number; calls: number } {
    return this.gateway.stats;
  }

  /** Usage over the last 7, 30 or 90 days (Europe/Madrid days). */
  @Get('stats/history')
  history(@Query({ schema: historyQuerySchema }) query: HistoryQuery): Promise<VideochatHistory> {
    return this.statistics.history(query.days);
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
    return this.videochat.suspendFromReport(admin, params.id, body.reason, body.duration);
  }

  /** The team checked this person's age by hand (needed when VIDEOCHAT_AGE_VERIFICATION_REQUIRED is on). */
  @Put('users/:userId/age-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  verifyAge(
    @CurrentUser() admin: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
  ): Promise<void> {
    return this.videochat.setAgeVerified(admin, params.userId, true);
  }

  @Delete('users/:userId/age-verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  unverifyAge(
    @CurrentUser() admin: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
  ): Promise<void> {
    return this.videochat.setAgeVerified(admin, params.userId, false);
  }

  @Get('suspensions')
  suspensions(): Promise<SuspensionView[]> {
    return this.videochat.listSuspensions();
  }

  @Delete('suspensions/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  lift(
    @CurrentUser() admin: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
  ): Promise<void> {
    return this.videochat.liftSuspension(admin, params.userId);
  }

  /** Everything about one person: profile, status, reports, sanctions and appeals. */
  @Get('users/:userId')
  user(@Param({ schema: userIdParamSchema }) params: UserIdParam): Promise<UserDetailView> {
    return this.videochat.userDetail(params.userId);
  }

  @Post('users/:userId/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  suspendUser(
    @CurrentUser() admin: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
    @Body({ schema: suspendUserSchema }) body: SuspendUserInput,
  ): Promise<void> {
    return this.videochat.suspend(admin, params.userId, body.reason, body.duration);
  }

  @Get('appeals')
  appeals(@Query({ schema: appealsQuerySchema }) query: AppealsQuery): Promise<AppealView[]> {
    return this.videochat.listAppeals(query.status);
  }

  /** Lifts the suspension and tells the person. */
  @Post('appeals/:id/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  acceptAppeal(
    @CurrentUser() admin: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: appealDecisionSchema }) body: AppealDecisionInput,
  ): Promise<void> {
    return this.videochat.resolveAppeal(admin, params.id, true, body.response);
  }

  /** Keeps the suspension and tells the person. */
  @Post('appeals/:id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  rejectAppeal(
    @CurrentUser() admin: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: appealDecisionSchema }) body: AppealDecisionInput,
  ): Promise<void> {
    return this.videochat.resolveAppeal(admin, params.id, false, body.response);
  }
}
