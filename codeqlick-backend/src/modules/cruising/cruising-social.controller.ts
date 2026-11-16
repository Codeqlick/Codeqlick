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
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  activeQuerySchema,
  blockSchema,
  checkInSchema,
  messageSchema,
  messagesQuerySchema,
  nicknameParamSchema,
  openConversationSchema,
  type ActiveQuery,
  type BlockInput,
  type CheckInInput,
  type MessageInput,
  type MessagesQuery,
  type NicknameParam,
  type OpenConversationInput,
} from './cruising.schemas.js';
import {
  CruisingSocialService,
  type CruisingCheckInView,
  type CruisingConversationView,
  type CruisingMember,
  type CruisingMessageView,
  type CruisingPresence,
} from './cruising-social.service.js';

/** Cruising's members' network (architecture 4.15, phase 2): any signed-in account that entered. */
@ApiTags('cruising')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('cruising')
export class CruisingSocialController {
  constructor(private readonly social: CruisingSocialService) {}

  @Get('members/:nickname')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  member(
    @CurrentUser() user: AuthUser,
    @Param({ schema: nicknameParamSchema }) params: NicknameParam,
  ): Promise<CruisingMember> {
    return this.social.member(user.id, params.nickname);
  }

  /** My active check-in, or JSON `null` (Nest would send an empty body for a null return). */
  @Get('check-in')
  async myCheckIn(@CurrentUser() user: AuthUser, @Res() res: Response): Promise<void> {
    res.json(await this.social.myCheckIn(user.id));
  }

  @Post('check-ins')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  checkIn(
    @CurrentUser() user: AuthUser,
    @Body({ schema: checkInSchema }) body: CheckInInput,
  ): Promise<CruisingCheckInView> {
    return this.social.checkIn(user.id, body);
  }

  @Delete('check-in')
  @HttpCode(HttpStatus.NO_CONTENT)
  endCheckIn(@CurrentUser() user: AuthUser): Promise<void> {
    return this.social.endCheckIn(user.id);
  }

  @Get('spots/:id/presence')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  presence(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<CruisingPresence> {
    return this.social.presence(user.id, params.id);
  }

  /** The spots of a box of the map with someone there now (phase 3); the web asks by grid cell. */
  @Get('active')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  active(
    @CurrentUser() user: AuthUser,
    @Query({ schema: activeQuerySchema }) query: ActiveQuery,
  ): Promise<{ items: { spotId: string; here: number }[] }> {
    return this.social.active(user.id, query.bbox);
  }

  @Get('conversations')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async conversations(
    @CurrentUser() user: AuthUser,
  ): Promise<{ items: CruisingConversationView[] }> {
    return { items: await this.social.conversations(user.id) };
  }

  /** Opens the conversation (`201`) or returns the one that exists (`200`). */
  @Post('conversations')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async openConversation(
    @CurrentUser() user: AuthUser,
    @Body({ schema: openConversationSchema }) body: OpenConversationInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ id: string }> {
    const { id, created } = await this.social.openConversation(user.id, body.nickname);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return { id };
  }

  @Get('conversations/:id/messages')
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  async messages(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: messagesQuerySchema }) query: MessagesQuery,
  ): Promise<{ items: CruisingMessageView[] }> {
    return { items: await this.social.messages(user.id, params.id, query.after) };
  }

  @Post('conversations/:id/messages')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  sendMessage(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: messageSchema }) body: MessageInput,
  ): Promise<CruisingMessageView> {
    return this.social.sendMessage(user.id, params.id, body.text);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteConversation(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.social.deleteConversation(user.id, params.id);
  }

  @Post('conversations/:id/block')
  @HttpCode(HttpStatus.NO_CONTENT)
  blockConversation(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.social.blockConversation(user.id, params.id);
  }

  @Get('blocks')
  blocks(@CurrentUser() user: AuthUser) {
    return this.social.blocks(user.id);
  }

  @Post('blocks')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  block(
    @CurrentUser() user: AuthUser,
    @Body({ schema: blockSchema }) body: BlockInput,
  ): Promise<void> {
    return this.social.block(user.id, body.nickname);
  }

  @Delete('blocks/:nickname')
  @HttpCode(HttpStatus.NO_CONTENT)
  unblock(
    @CurrentUser() user: AuthUser,
    @Param({ schema: nicknameParamSchema }) params: NicknameParam,
  ): Promise<void> {
    return this.social.unblock(user.id, params.nickname);
  }
}
