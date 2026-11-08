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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { MeetingsGateway } from './meetings.gateway.js';
import {
  codeParamSchema,
  createRoomSchema,
  guestTicketSchema,
  updateRoomSchema,
  type CodeParam,
  type CreateRoomInput,
  type GuestTicketInput,
  type UpdateRoomInput,
} from './meetings.schemas.js';
import {
  MeetingsService,
  type MeetingTicket,
  type PublicRoom,
  type RoomView,
} from './meetings.service.js';

/** Meeting rooms of a signed-in person, and their tickets into any room. */
@ApiTags('meetings')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('meetings/rooms')
export class MeetingsController {
  constructor(
    private readonly meetings: MeetingsService,
    private readonly gateway: MeetingsGateway,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser): Promise<{ items: RoomView[] }> {
    return { items: await this.meetings.listRooms(user.id, (id) => this.gateway.live(id)) };
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createRoomSchema }) body: CreateRoomInput,
  ): Promise<RoomView> {
    return this.meetings.createRoom(user.id, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updateRoomSchema }) body: UpdateRoomInput,
  ): Promise<RoomView> {
    return this.meetings.updateRoom(user.id, params.id, body, (id) => this.gateway.live(id));
  }

  /** Deletes the room; a meeting going on in it ends. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.meetings.deleteRoom(user.id, params.id);
  }

  /** A single-use ticket (30 s) into the room with the account's name, and the ICE servers. */
  @Post(':code/ticket')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  ticket(
    @CurrentUser() user: AuthUser,
    @Param({ schema: codeParamSchema }) params: CodeParam,
  ): Promise<MeetingTicket> {
    return this.meetings.issueTicket(params.code, { userId: user.id, name: user.name });
  }
}

/** What anyone with a room's link can do: see it and get a guest's ticket. */
@ApiTags('meetings')
@Public()
@Controller('meetings/rooms')
export class MeetingsPublicController {
  constructor(
    private readonly meetings: MeetingsService,
    private readonly gateway: MeetingsGateway,
  ) {}

  @Get('by-code/:code')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  byCode(@Param({ schema: codeParamSchema }) params: CodeParam): Promise<PublicRoom> {
    return this.meetings.publicRoom(params.code, (id) => this.gateway.live(id));
  }

  @Post(':code/guest-ticket')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  guestTicket(
    @Param({ schema: codeParamSchema }) params: CodeParam,
    @Body({ schema: guestTicketSchema }) body: GuestTicketInput,
  ): Promise<MeetingTicket> {
    return this.meetings.issueTicket(params.code, { userId: null, name: body.name });
  }
}
