import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  notificationsReadSchema,
  visitsSettingsSchema,
  type NotificationsReadInput,
  type VisitsSettingsInput,
} from './cruising-notifications.schemas.js';
import {
  CruisingNotificationsService,
  type CruisingNotificationView,
} from './cruising-notifications.service.js';
import {
  CruisingWinksService,
  type CruisingVisitorView,
  type CruisingWinkView,
} from './cruising-winks.service.js';
import { nicknameParamSchema, type NicknameParam } from './cruising.schemas.js';

/**
 * Cruising phase 6 (architecture 4.15): winks and profile visits (decision 97) and the
 * notification centre (decision 98). Any signed-in account that entered.
 */
@ApiTags('cruising')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('cruising')
export class CruisingNotificationsController {
  constructor(
    private readonly winks: CruisingWinksService,
    private readonly notifications: CruisingNotificationsService,
  ) {}

  @Put('winks/:nickname')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  wink(
    @CurrentUser() user: AuthUser,
    @Param({ schema: nicknameParamSchema }) params: NicknameParam,
  ): Promise<void> {
    return this.winks.wink(user.id, params.nickname);
  }

  @Get('winks')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  received(@CurrentUser() user: AuthUser): Promise<{ items: CruisingWinkView[] }> {
    return this.winks.winks(user.id);
  }

  @Get('visits')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  visitors(
    @CurrentUser() user: AuthUser,
  ): Promise<{ showVisits: boolean; items: CruisingVisitorView[] }> {
    return this.winks.visitors(user.id);
  }

  @Put('visits/settings')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  visitsSettings(
    @CurrentUser() user: AuthUser,
    @Body({ schema: visitsSettingsSchema }) body: VisitsSettingsInput,
  ): Promise<{ showVisits: boolean }> {
    return this.winks.setShowVisits(user.id, body.showVisits);
  }

  /** Polled by the app's bell every minute. */
  @Get('notifications')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  list(
    @CurrentUser() user: AuthUser,
  ): Promise<{ items: CruisingNotificationView[]; unread: number }> {
    return this.notifications.list(user.id);
  }

  @Post('notifications/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  markRead(
    @CurrentUser() user: AuthUser,
    @Body({ schema: notificationsReadSchema }) body: NotificationsReadInput,
  ): Promise<void> {
    return this.notifications.markRead(user.id, body.ids);
  }
}
