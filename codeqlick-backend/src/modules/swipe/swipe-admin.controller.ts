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
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { privateImage } from './swipe.controller.js';
import {
  photosQuerySchema,
  rejectPhotoSchema,
  reportActionSchema,
  reportsQuerySchema,
  suspendUserSchema,
  takedownDecisionSchema,
  takedownsQuerySchema,
  userIdParamSchema,
  verificationDecisionSchema,
  type PhotosQuery,
  type RejectPhotoInput,
  type ReportActionInput,
  type ReportsQuery,
  type SuspendUserInput,
  type TakedownDecision,
  type TakedownsQuery,
  type UserIdParam,
  type VerificationDecision,
} from './swipe.schemas.js';
import { SwipeService } from './swipe.service.js';

/** Swipe's moderation: verification photos, the photo queue, reports and removal requests. */
@ApiTags('admin: swipe')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/swipe')
export class SwipeAdminController {
  constructor(private readonly swipe: SwipeService) {}

  @Get('overview')
  overview() {
    return this.swipe.overview();
  }

  @Get('verifications')
  async verifications() {
    return { items: await this.swipe.pendingVerifications() };
  }

  @Get('verifications/:userId/file')
  @Header('Cache-Control', 'private, no-store')
  async verificationFile(
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
  ): Promise<StreamableFile> {
    return privateImage(await this.swipe.verificationFile(params.userId));
  }

  @Post('verifications/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  decideVerification(
    @CurrentUser() user: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
    @Body({ schema: verificationDecisionSchema }) body: VerificationDecision,
  ): Promise<void> {
    return this.swipe.decideVerification(user, params.userId, body);
  }

  @Get('photos')
  async photos(@Query({ schema: photosQuerySchema }) query: PhotosQuery) {
    return { items: await this.swipe.photos(query.status) };
  }

  @Post('photos/:id/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  approve(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.swipe.approvePhoto(user, params.id);
  }

  @Post('photos/:id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  reject(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: rejectPhotoSchema }) body: RejectPhotoInput,
  ): Promise<void> {
    return this.swipe.rejectPhoto(user, params.id, body.reason, body.block);
  }

  @Post('photos/:id/hide')
  @HttpCode(HttpStatus.NO_CONTENT)
  hide(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.swipe.hidePhoto(user, params.id);
  }

  @Get('reports')
  async reports(@Query({ schema: reportsQuerySchema }) query: ReportsQuery) {
    return { items: await this.swipe.reports(query.status) };
  }

  @Post('reports/:id/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  dismiss(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.swipe.dismissReport(user, params.id);
  }

  @Post('reports/:id/action')
  @HttpCode(HttpStatus.NO_CONTENT)
  act(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: reportActionSchema }) body: ReportActionInput,
  ): Promise<void> {
    return this.swipe.actOnReport(user, params.id, body);
  }

  @Get('takedowns')
  async takedowns(@Query({ schema: takedownsQuerySchema }) query: TakedownsQuery) {
    return { items: await this.swipe.takedowns(query.status) };
  }

  @Post('takedowns/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  decideTakedown(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: takedownDecisionSchema }) body: TakedownDecision,
  ): Promise<void> {
    return this.swipe.decideTakedown(user, params.id, body);
  }

  @Get('suspensions')
  async suspensions() {
    return { items: await this.swipe.suspensions() };
  }

  @Post('users/:userId/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  suspend(
    @CurrentUser() user: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
    @Body({ schema: suspendUserSchema }) body: SuspendUserInput,
  ): Promise<void> {
    return this.swipe.suspend(user, params.userId, body);
  }

  @Delete('users/:userId/suspension')
  @HttpCode(HttpStatus.NO_CONTENT)
  unsuspend(
    @CurrentUser() user: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
  ): Promise<void> {
    return this.swipe.unsuspend(user, params.userId);
  }
}
