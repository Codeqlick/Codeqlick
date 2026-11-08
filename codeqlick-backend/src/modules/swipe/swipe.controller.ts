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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  MAX_UPLOAD_BYTES,
  messageSchema,
  messagesQuerySchema,
  onboardingSchema,
  profileSchema,
  pushSubscriptionSchema,
  pushUnsubscribeSchema,
  reportSchema,
  takedownSchema,
  uploadFieldsSchema,
  voteSchema,
  type MessageInput,
  type MessagesQuery,
  type OnboardingInput,
  type PushSubscriptionInput,
  type PushUnsubscribeInput,
  type ReportInput,
  type SwipeProfileInput,
  type TakedownInput,
  type UploadFields,
  type VoteInput,
} from './swipe.schemas.js';
import { SwipePushService } from './swipe-push.service.js';
import {
  SwipeService,
  type CardView,
  type MatchView,
  type MessageView,
  type MyPhotoView,
  type PhotoFile,
  type SwipeStatus,
} from './swipe.service.js';

const fileBody = {
  schema: {
    type: 'object',
    properties: { file: { type: 'string', format: 'binary' }, consent: { type: 'string' } },
  },
} as const;

/** The file comes back private: never cached by a shared cache, never sniffed as another type. */
export function privateImage(file: PhotoFile): StreamableFile {
  return new StreamableFile(file.stream, { type: 'image/webp', length: file.size });
}

/** Swipe for its members (architecture 4.10): any signed-in account. */
@ApiTags('swipe')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('swipe')
export class SwipeController {
  constructor(
    private readonly swipe: SwipeService,
    private readonly push: SwipePushService,
  ) {}

  /** The VAPID key this browser subscribes with; null while notifications are off. */
  @Get('push')
  pushKey(): { publicKey: string | null } {
    return { publicKey: this.push.publicKey };
  }

  /** This browser wants notifications of matches, messages and "love" (Web Push). */
  @Put('push')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  subscribePush(
    @CurrentUser() user: AuthUser,
    @Body({ schema: pushSubscriptionSchema }) body: PushSubscriptionInput,
  ): Promise<void> {
    return this.push.subscribe(user.id, body);
  }

  @Delete('push')
  @HttpCode(HttpStatus.NO_CONTENT)
  unsubscribePush(
    @CurrentUser() user: AuthUser,
    @Body({ schema: pushUnsubscribeSchema }) body: PushUnsubscribeInput,
  ): Promise<void> {
    return this.push.unsubscribe(user.id, body.endpoint);
  }

  @Get('me')
  status(@CurrentUser() user: AuthUser): Promise<SwipeStatus> {
    return this.swipe.status(user.id);
  }

  /** Confirms 18+ (the date of birth is checked, not stored) and accepts the rules. */
  @Put('me')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  onboard(
    @CurrentUser() user: AuthUser,
    @Body({ schema: onboardingSchema }) body: OnboardingInput,
  ): Promise<SwipeStatus> {
    return this.swipe.onboard(user.id, body);
  }

  @Put('profile')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  saveProfile(
    @CurrentUser() user: AuthUser,
    @Body({ schema: profileSchema }) body: SwipeProfileInput,
  ): Promise<SwipeStatus> {
    return this.swipe.saveProfile(user.id, body);
  }

  /** The verification photo (holding a paper with the nickname and the date). */
  @Post('verification')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  // No storage option: the file stays in memory until it has been checked and re-encoded.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  uploadVerification(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body({ schema: uploadFieldsSchema }) _fields: UploadFields,
  ): Promise<SwipeStatus> {
    return this.swipe.uploadVerification(user.id, file?.buffer);
  }

  @Get('verification/file')
  @Header('Cache-Control', 'private, no-store')
  async verificationFile(@CurrentUser() user: AuthUser): Promise<StreamableFile> {
    return privateImage(await this.swipe.verificationFile(user.id));
  }

  @Get('photos')
  async myPhotos(@CurrentUser() user: AuthUser): Promise<{ items: MyPhotoView[] }> {
    return { items: await this.swipe.myPhotos(user.id) };
  }

  /** A photo for review: `consent` ("true") confirms it shows the uploader, an adult, who agrees. */
  @Post('photos')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @ApiBody(fileBody)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  uploadPhoto(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Body({ schema: uploadFieldsSchema }) _fields: UploadFields,
  ): Promise<MyPhotoView> {
    return this.swipe.uploadPhoto(user.id, file?.buffer);
  }

  @Delete('photos/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePhoto(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.swipe.deletePhoto(user.id, params.id);
  }

  /** The image of a photo: its owner, the team, or a member it is shown to as a card. */
  @Get('photos/:id/file')
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Header('Cache-Control', 'private, max-age=300')
  async photoFile(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<StreamableFile> {
    return privateImage(await this.swipe.photoFile(user, params.id));
  }

  @Get('deck')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async deck(@CurrentUser() user: AuthUser): Promise<{ items: CardView[] }> {
    return { items: await this.swipe.deck(user.id) };
  }

  @Post('votes')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 300, ttl: 60 * 60_000 } })
  vote(
    @CurrentUser() user: AuthUser,
    @Body({ schema: voteSchema }) body: VoteInput,
  ): Promise<{ match: { id: string; nickname: string } | null }> {
    return this.swipe.vote(user.id, body.photoId, body.like, body.superLike);
  }

  /** Undoes my last vote, when it is recent and made no match; returns its card again. */
  @Post('votes/undo')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  undo(@CurrentUser() user: AuthUser): Promise<{ card: CardView }> {
    return this.swipe.undoVote(user.id);
  }

  @Get('matches')
  async matches(@CurrentUser() user: AuthUser): Promise<{ items: MatchView[] }> {
    return { items: await this.swipe.matches(user.id) };
  }

  @Get('matches/:id/messages')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async messages(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: messagesQuerySchema }) query: MessagesQuery,
  ): Promise<{ items: MessageView[] }> {
    return { items: await this.swipe.messages(user.id, params.id, query.after) };
  }

  @Post('matches/:id/messages')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: messageSchema }) body: MessageInput,
  ): Promise<MessageView> {
    return this.swipe.sendMessage(user.id, params.id, body.text);
  }

  @Delete('matches/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  unmatch(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.swipe.unmatch(user.id, params.id);
  }

  @Post('matches/:id/block')
  @HttpCode(HttpStatus.NO_CONTENT)
  block(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.swipe.blockMatch(user.id, params.id);
  }

  @Post('reports')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  report(
    @CurrentUser() user: AuthUser,
    @Body({ schema: reportSchema }) body: ReportInput,
  ): Promise<void> {
    return this.swipe.report(user.id, body);
  }
}

/** What anyone can do: ask for a photo to be removed (EU Digital Services Act). */
@ApiTags('swipe')
@Public()
@Controller('swipe')
export class SwipePublicController {
  constructor(private readonly swipe: SwipeService) {}

  @Post('takedown')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  takedown(@Body({ schema: takedownSchema }) body: TakedownInput): Promise<{ id: string }> {
    return this.swipe.takedown(body);
  }
}
