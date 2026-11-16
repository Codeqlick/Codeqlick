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
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { CruisingAlbumService, type AlbumGrantView } from './cruising-album.service.js';
import {
  CruisingRoomsService,
  type RoomListItem,
  type RoomMessageView,
  type RoomPosting,
} from './cruising-rooms.service.js';
import {
  messagesQuerySchema,
  nicknameParamSchema,
  placeParamsSchema,
  roomMessageSchema,
  roomMuteSchema,
  userIdParamSchema,
  type MessagesQuery,
  type NicknameParam,
  type PlaceParams,
  type RoomMessageInput,
  type RoomMuteInput,
  type UserIdParam,
} from './cruising.schemas.js';

/**
 * Cruising's phase 6 (architecture 4.15): the private album shared per person (decision 99) and
 * the city chat rooms (decision 100). Any signed-in account that entered; the services check the
 * rest.
 */
@ApiTags('cruising')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('cruising')
export class CruisingRoomsController {
  constructor(
    private readonly album: CruisingAlbumService,
    private readonly rooms: CruisingRoomsService,
  ) {}

  // ---- Private album -----------------------------------------------------------------------------

  @Get('album-grants')
  grants(
    @CurrentUser() user: AuthUser,
  ): Promise<{ given: AlbumGrantView[]; received: AlbumGrantView[] }> {
    return this.album.grants(user.id);
  }

  @Put('album-grants/:nickname')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  share(
    @CurrentUser() user: AuthUser,
    @Param({ schema: nicknameParamSchema }) params: NicknameParam,
  ): Promise<void> {
    return this.album.share(user.id, params.nickname);
  }

  @Delete('album-grants/:nickname')
  @HttpCode(HttpStatus.NO_CONTENT)
  revoke(
    @CurrentUser() user: AuthUser,
    @Param({ schema: nicknameParamSchema }) params: NicknameParam,
  ): Promise<void> {
    return this.album.revoke(user.id, params.nickname);
  }

  // ---- City rooms --------------------------------------------------------------------------------

  @Get('rooms')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  myRooms(@CurrentUser() user: AuthUser): Promise<{ items: RoomListItem[] }> {
    return this.rooms.myRooms(user.id);
  }

  /** The web polls this every 5 seconds. */
  @Get('rooms/:countryCode/:citySlug/messages')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  messages(
    @CurrentUser() user: AuthUser,
    @Param({ schema: placeParamsSchema }) params: PlaceParams,
    @Query({ schema: messagesQuerySchema }) query: MessagesQuery,
  ): Promise<{ items: RoomMessageView[]; posting: RoomPosting }> {
    return this.rooms.messages(user.id, params, query.after);
  }

  @Post('rooms/:countryCode/:citySlug/messages')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  post(
    @CurrentUser() user: AuthUser,
    @Param({ schema: placeParamsSchema }) params: PlaceParams,
    @Body({ schema: roomMessageSchema }) body: RoomMessageInput,
  ): Promise<RoomMessageView> {
    return this.rooms.post(user.id, params, body.text);
  }
}

/** The team's tools for the city rooms (decision 100): deleting messages and muting members. */
@ApiTags('admin: cruising')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/cruising')
export class CruisingRoomsAdminController {
  constructor(private readonly rooms: CruisingRoomsService) {}

  @Delete('room-messages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMessage(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.rooms.deleteMessage(user, params.id);
  }

  @Post('users/:userId/room-mute')
  @HttpCode(HttpStatus.NO_CONTENT)
  mute(
    @CurrentUser() user: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
    @Body({ schema: roomMuteSchema }) body: RoomMuteInput,
  ): Promise<void> {
    return this.rooms.mute(user, params.userId, body.duration);
  }

  @Delete('users/:userId/room-mute')
  @HttpCode(HttpStatus.NO_CONTENT)
  unmute(
    @CurrentUser() user: AuthUser,
    @Param({ schema: userIdParamSchema }) params: UserIdParam,
  ): Promise<void> {
    return this.rooms.unmute(user, params.userId);
  }
}
