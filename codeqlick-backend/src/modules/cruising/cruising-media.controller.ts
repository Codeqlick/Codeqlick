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
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from './cruising-media.rules.js';
import {
  CruisingMediaService,
  type MediaFileResult,
  type MemberMediaView,
  type MyMediaView,
  type ReceivedFile,
} from './cruising-media.service.js';
import {
  adminMediaQuerySchema,
  mediaPatchSchema,
  mediaUploadFieldsSchema,
  nicknameParamSchema,
  removeMediaSchema,
  userIdParamSchema,
  verificationDecisionSchema,
  type AdminMediaQuery,
  type MediaPatch,
  type MediaUploadFields,
  type NicknameParam,
  type RemoveMediaInput,
  type UserIdParam,
  type VerificationDecision,
} from './cruising.schemas.js';
import { CruisingService } from './cruising.service.js';

const fileBody = {
  schema: {
    type: 'object',
    properties: { file: { type: 'string', format: 'binary' }, consent: { type: 'string' } },
  },
} as const;

/**
 * Streams a media file privately: never stored by a shared cache or the browser's, never indexed,
 * never sniffed as another type; with a `Range` it answers 206 (videos seek and play while loading).
 */
export function sendMediaFile(res: Response, result: MediaFileResult): void {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Accept-Ranges', 'bytes');
  if ('unsatisfiable' in result) {
    res.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE);
    res.setHeader('Content-Range', `bytes */${result.size}`);
    res.end();
    return;
  }
  res.setHeader('Content-Type', result.contentType);
  if (result.range) {
    res.status(HttpStatus.PARTIAL_CONTENT);
    res.setHeader(
      'Content-Range',
      `bytes ${result.range.start}-${result.range.end}/${result.size}`,
    );
    res.setHeader('Content-Length', String(result.range.end - result.range.start + 1));
  } else {
    res.status(HttpStatus.OK);
    res.setHeader('Content-Length', String(result.size));
  }
  result.stream.on('error', () => res.destroy());
  result.stream.pipe(res);
}

/** Cruising's photos, videos and verification for members (architecture 4.15, phase 4). */
@ApiTags('cruising')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('cruising')
export class CruisingMediaController {
  constructor(private readonly media: CruisingMediaService) {}

  /** The verification photo: the member holding a paper with their nickname and the date. */
  @Post('verification')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
  uploadVerification(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: ReceivedFile | undefined,
  ): Promise<{ status: 'PENDING' }> {
    return this.media.uploadVerification(user.id, file);
  }

  @Get('verification/file')
  async verificationFile(@CurrentUser() user: AuthUser, @Res() res: Response): Promise<void> {
    sendMediaFile(res, await this.media.myVerificationFile(user.id));
  }

  @Get('media')
  myMedia(@CurrentUser() user: AuthUser) {
    return this.media.myMedia(user.id);
  }

  /** A photo or video, with `consent` "true": LIVE at once (a video once transcoded). */
  @Post('media')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_VIDEO_BYTES, files: 1, fields: 4 } }),
  )
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: ReceivedFile | undefined,
    @Body({ schema: mediaUploadFieldsSchema }) fields: MediaUploadFields,
  ): Promise<MyMediaView> {
    return this.media.upload(user.id, file, fields.consent, new Date(), fields.album);
  }

  @Patch('media/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  updateMedia(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: mediaPatchSchema }) body: MediaPatch,
  ): Promise<void> {
    return this.media.updateMedia(user.id, params.id, body);
  }

  @Delete('media/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMedia(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.media.deleteMedia(user.id, params.id);
  }

  @Get('members/:nickname/media')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  memberMedia(
    @CurrentUser() user: AuthUser,
    @Param({ schema: nicknameParamSchema }) params: NicknameParam,
  ): Promise<{ items: MemberMediaView[] }> {
    return this.media.memberMedia(user.id, params.nickname);
  }

  /** The photo or video (range requests), to who may see it; else 404. */
  @Get('media/:id/file')
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  async file(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    sendMediaFile(res, await this.media.file(user, params.id, 'file', req.headers.range));
  }

  /** A video's poster frame. */
  @Get('media/:id/poster')
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  async poster(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    sendMediaFile(res, await this.media.file(user, params.id, 'poster', req.headers.range));
  }
}

/** Cruising's media moderation: the "New media" queue and the verification photos. */
@ApiTags('admin: cruising')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/cruising')
export class CruisingMediaAdminController {
  constructor(
    private readonly media: CruisingMediaService,
    private readonly cruising: CruisingService,
  ) {}

  @Get('media')
  async list(@Query({ schema: adminMediaQuerySchema }) query: AdminMediaQuery) {
    return { items: await this.media.adminMedia(query.queue) };
  }

  @Post('media/:id/reviewed')
  @HttpCode(HttpStatus.NO_CONTENT)
  reviewed(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.media.markReviewed(user, params.id);
  }

  @Post('media/:id/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: removeMediaSchema }) body: RemoveMediaInput,
  ): Promise<void> {
    return this.cruising.removeMedia(user, params.id, body);
  }

  @Get('verifications')
  async verifications() {
    return { items: await this.media.pendingVerifications() };
  }

  @Get('verifications/:userId/file')
  async verificationFile(
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
    @Res() res: Response,
  ): Promise<void> {
    sendMediaFile(res, await this.media.verificationFile(params.userId));
  }

  @Post('verifications/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  decide(
    @CurrentUser() user: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
    @Body({ schema: verificationDecisionSchema }) body: VerificationDecision,
  ): Promise<void> {
    return this.media.decideVerification(user, params.userId, body);
  }

  /** Takes a member's "Verified" badge away. */
  @Delete('users/:userId/verification')
  @HttpCode(HttpStatus.NO_CONTENT)
  withdraw(
    @CurrentUser() user: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
  ): Promise<void> {
    return this.media.withdrawVerification(user, params.userId);
  }
}
