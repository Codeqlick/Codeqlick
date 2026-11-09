import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { VideochatStatsService, type VideochatHistory } from './videochat-stats.service.js';
import {
  VideochatSuspiciousService,
  type SuspiciousAccount,
} from './videochat-suspicious.service.js';
import { privateImage } from '../swipe/swipe.controller.js';
import {
  VideochatVerificationService,
  type PendingVerification,
} from './videochat-verification.service.js';
import { VideochatGateway } from './videochat.gateway.js';
import {
  appealDecisionSchema,
  appealsQuerySchema,
  bulkReportsSchema,
  historyQuerySchema,
  reportsQuerySchema,
  suspendSchema,
  suspendUserSchema,
  userIdParamSchema,
  verificationDecisionSchema,
  type AppealDecisionInput,
  type AppealsQuery,
  type BulkReportsInput,
  type HistoryQuery,
  type ReportsQuery,
  type SuspendInput,
  type SuspendUserInput,
  type UserIdParam,
  type VerificationDecision,
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
    private readonly suspicious: VideochatSuspiciousService,
    private readonly verification: VideochatVerificationService,
  ) {}

  /** Accounts that look like bots or fake profiles, highest score first (architecture 4.7). */
  /** Verification photos waiting for review, oldest first. */
  @Get('verifications')
  async verifications(): Promise<{ items: PendingVerification[] }> {
    return { items: await this.verification.pending() };
  }

  @Get('verifications/:userId/file')
  @Header('Cache-Control', 'private, no-store')
  async verificationFile(
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
  ): Promise<StreamableFile> {
    return privateImage(await this.verification.file(params.userId));
  }

  @Post('verifications/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  decideVerification(
    @CurrentUser() user: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
    @Body({ schema: verificationDecisionSchema }) body: VerificationDecision,
  ): Promise<void> {
    return this.verification.decide(user, params.userId, body);
  }

  /** Takes the verified badge away; the person may send a new photo. */
  @Delete('users/:userId/verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeVerification(
    @CurrentUser() user: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
  ): Promise<void> {
    return this.verification.revoke(user, params.userId);
  }

  @Get('suspicious')
  suspiciousAccounts(): Promise<SuspiciousAccount[]> {
    return this.suspicious.list();
  }

  /** Hides the account from the suspicious list for 30 days. */
  @Post('users/:userId/not-suspicious')
  @HttpCode(HttpStatus.NO_CONTENT)
  notSuspicious(@Param({ schema: userIdParamSchema }) params: UserIdParam): Promise<void> {
    return this.suspicious.clear(params.userId);
  }

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

  /** Dismisses or suspends from several reports at once (the moderation page's bulk actions). */
  @Post('reports/bulk')
  @HttpCode(HttpStatus.OK)
  bulk(
    @CurrentUser() admin: AuthUser,
    @Body({ schema: bulkReportsSchema }) body: BulkReportsInput,
  ): Promise<{ done: number; skipped: number }> {
    return this.videochat.bulkReports(admin, body.ids, body.action, body.duration);
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
