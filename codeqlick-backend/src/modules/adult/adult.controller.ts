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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { privateImage } from '../swipe/swipe.controller.js';
import { MAX_UPLOAD_BYTES } from '../swipe/swipe.schemas.js';
import { AdultAdminService } from './adult-admin.service.js';
import { AdultSafetyService, type AdultBlockView } from './adult-safety.service.js';
import {
  AdultVerificationService,
  type AdultVerificationView,
} from './adult-verification.service.js';
import {
  appQuerySchema,
  bannedEmailSchema,
  blockRefParamSchema,
  liftSuspensionSchema,
  reviewParamSchema,
  sharedSuspensionSchema,
  userIdParamSchema,
  verificationDecisionSchema,
  withdrawVerificationSchema,
  type AdultVerificationDecision,
  type AppQuery,
  type BannedEmailInput,
  type BlockRefParam,
  type LiftSuspensionInput,
  type ReviewParam,
  type SharedSuspensionInput,
  type UserIdParam,
  type WithdrawVerificationInput,
} from './adult.schemas.js';
import { Realm } from '../../common/decorators/realm.decorator.js';
import { NeoqlickTargetGuard } from '../../common/guards/realm-target.guard.js';

/** What a member of the 18+ apps shares across them: the verification and the blocks (4.16). */
@ApiTags('adult')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Realm('NEOQLICK')
@Controller('adult')
export class AdultController {
  constructor(
    private readonly safety: AdultSafetyService,
    private readonly verification: AdultVerificationService,
  ) {}

  /** The account's verification (the badge is the account's, in the three apps). */
  @Get('verification')
  @Header('Cache-Control', 'private, no-store')
  verificationStatus(@CurrentUser() user: AuthUser): Promise<AdultVerificationView> {
    return this.verification.view(user.id);
  }

  /** The photo: the member holding a paper with their name in `app`, "Codeqlick" and the date. */
  @Post('verification')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  // No storage option: the file stays in memory until it has been checked and re-encoded.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Query({ schema: appQuerySchema }) query: AppQuery,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<AdultVerificationView> {
    return this.verification.upload(user.id, query.app, file?.buffer);
  }

  /** My photo while it waits for review. */
  @Get('verification/file')
  @Header('Cache-Control', 'private, no-store')
  async verificationFile(@CurrentUser() user: AuthUser): Promise<StreamableFile> {
    return privateImage(await this.verification.myFile(user.id));
  }

  /** My blocks in the three apps, each person named in the asking app. */
  @Get('blocks')
  @Header('Cache-Control', 'private, no-store')
  blocks(
    @CurrentUser() user: AuthUser,
    @Query({ schema: appQuerySchema }) query: AppQuery,
  ): Promise<{ items: AdultBlockView[] }> {
    return this.safety.blocks(user.id, query.app);
  }

  /** Lifts one of my blocks in the three apps. */
  @Delete('blocks/:ref')
  @HttpCode(HttpStatus.NO_CONTENT)
  unblock(
    @CurrentUser() user: AuthUser,
    @Param({ schema: blockRefParamSchema }) params: BlockRefParam,
  ): Promise<void> {
    return this.safety.unblockRef(user.id, params.ref);
  }
}

/** The team's shared moderation of the 18+ apps (architecture 4.16, phase 1). */
@ApiTags('admin: adult')
@ApiBearerAuth()
@Roles('ADMIN')
@UseGuards(NeoqlickTargetGuard)
@Controller('admin/adult')
export class AdultAdminController {
  constructor(
    private readonly safety: AdultSafetyService,
    private readonly verification: AdultVerificationService,
    private readonly admin: AdultAdminService,
  ) {}

  /** "Across the 18+ apps": the person's history in the three. */
  @Get('users/:userId')
  person(@Param({ schema: userIdParamSchema }) params: UserIdParam) {
    return this.admin.person(params.userId);
  }

  /** The one verification queue of the three apps. */
  @Get('verifications')
  verifications() {
    return this.verification.pending();
  }

  @Get('verifications/:userId/file')
  @Header('Cache-Control', 'private, no-store')
  async verificationFile(
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
  ): Promise<StreamableFile> {
    return privateImage(await this.verification.adminFile(params.userId));
  }

  @Post('verifications/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  decide(
    @CurrentUser() user: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
    @Body({ schema: verificationDecisionSchema }) body: AdultVerificationDecision,
  ): Promise<void> {
    return this.verification.decide(user, params.userId, body);
  }

  /** Withdraws the badge in the three apps (the person is emailed). */
  @Delete('users/:userId/verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  withdraw(
    @CurrentUser() user: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
    @Body({ schema: withdrawVerificationSchema }) body: WithdrawVerificationInput,
  ): Promise<void> {
    return this.verification.withdraw(user, params.userId, body.reason || null);
  }

  /** A MINOR, NON_CONSENSUAL or ILLEGAL suspension in the three apps. */
  @Post('users/:userId/suspension')
  @HttpCode(HttpStatus.NO_CONTENT)
  suspend(
    @CurrentUser() user: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
    @Body({ schema: sharedSuspensionSchema }) body: SharedSuspensionInput,
  ): Promise<void> {
    return this.safety.suspend(user, params.userId, body);
  }

  /** Lifts the shared suspension in the three apps. */
  @Delete('users/:userId/suspension')
  @HttpCode(HttpStatus.NO_CONTENT)
  lift(
    @CurrentUser() user: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
    @Body({ schema: liftSuspensionSchema }) body: LiftSuspensionInput,
  ): Promise<void> {
    return this.safety.lift(user, params.userId, body.reason);
  }

  /** Per-app suspensions from serious reports made before phase 1, to share or leave once. */
  @Get('review-suspensions')
  reviews() {
    return this.safety.reviews();
  }

  @Post('review-suspensions/:app/:userId/share')
  @HttpCode(HttpStatus.NO_CONTENT)
  share(
    @CurrentUser() user: AuthUser,
    @Param({ schema: reviewParamSchema }) params: ReviewParam,
  ): Promise<void> {
    return this.safety.shareReviewed(user, params.app, params.userId);
  }

  @Post('review-suspensions/:app/:userId/keep')
  @HttpCode(HttpStatus.NO_CONTENT)
  keep(
    @CurrentUser() user: AuthUser,
    @Param({ schema: reviewParamSchema }) params: ReviewParam,
  ): Promise<void> {
    return this.safety.keepReviewed(user, params.app, params.userId);
  }

  /** Deletes a kept email hash on an accepted appeal (decision 120). */
  @Delete('banned-emails')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteBannedEmail(
    @CurrentUser() user: AuthUser,
    @Body({ schema: bannedEmailSchema }) body: BannedEmailInput,
  ): Promise<void> {
    return this.safety.deleteBannedEmail(user, body.email);
  }
}
