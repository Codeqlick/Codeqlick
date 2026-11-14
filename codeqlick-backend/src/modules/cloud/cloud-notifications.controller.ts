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
import { CloudApi } from '../../common/decorators/cloud-api.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import { Caller, type CloudCtx } from './cloud-caller.js';
import { CloudNotificationsService, type ChannelView } from './cloud-notifications.service.js';
import {
  channelParamSchema,
  createChannelSchema,
  testChannelSchema,
  updateChannelSchema,
  type ChannelParam,
  type CreateChannelInput,
  type TestChannelInput,
  type UpdateChannelInput,
} from './cloud.schemas.js';

/** A project's notifications (architecture 4.13 "Build notifications", decisions 43 and 63). */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('cloud/projects/:id/notifications')
export class CloudNotificationsController {
  constructor(private readonly notifications: CloudNotificationsService) {}

  @Get()
  @CloudApi()
  list(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<{ items: ChannelView[] }> {
    return this.notifications.list(ctx, params.id);
  }

  @Post()
  @CloudApi()
  create(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createChannelSchema }) body: CreateChannelInput,
  ): Promise<ChannelView & { secret?: string }> {
    return this.notifications.create(ctx, params.id, body);
  }

  @Patch(':channelId')
  @CloudApi()
  update(
    @Caller() ctx: CloudCtx,
    @Param({ schema: channelParamSchema }) params: ChannelParam,
    @Body({ schema: updateChannelSchema }) body: UpdateChannelInput,
  ): Promise<ChannelView> {
    return this.notifications.update(ctx, params.id, params.channelId, body);
  }

  @Delete(':channelId')
  @CloudApi()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Caller() ctx: CloudCtx,
    @Param({ schema: channelParamSchema }) params: ChannelParam,
  ): Promise<void> {
    return this.notifications.remove(ctx, params.id, params.channelId);
  }

  @Post(':channelId/test')
  @CloudApi()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  test(
    @Caller() ctx: CloudCtx,
    @Param({ schema: channelParamSchema }) params: ChannelParam,
    @Body({ schema: testChannelSchema }) body: TestChannelInput,
  ): Promise<{ ok: boolean; error: string | null }> {
    return this.notifications.test(ctx, params.id, params.channelId, body.event);
  }
}
