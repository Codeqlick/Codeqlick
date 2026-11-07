import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { VideochatGateway } from './videochat.gateway.js';
import {
  appealSchema,
  onboardingSchema,
  settingsSchema,
  type AppealInput,
  type OnboardingInput,
  type VideochatSettings,
} from './videochat.schemas.js';
import {
  VideochatService,
  type VideochatStatus,
  type VideochatTicket,
} from './videochat.service.js';

/** The video chat for its users: any signed-in account (verified by registration). */
@ApiTags('videochat')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('videochat')
export class VideochatController {
  constructor(private readonly videochat: VideochatService) {}

  @Get('me')
  status(@CurrentUser() user: AuthUser): Promise<VideochatStatus> {
    return this.videochat.status(user.id);
  }

  /** Confirms 18+ (the date of birth is checked, not stored) and accepts the rules. */
  @Put('me')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  onboard(
    @CurrentUser() user: AuthUser,
    @Body({ schema: onboardingSchema }) body: OnboardingInput,
  ): Promise<VideochatStatus> {
    return this.videochat.onboard(user.id, body);
  }

  /** Public profile and matching filters (applied from the next connection). */
  @Put('profile')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  saveSettings(
    @CurrentUser() user: AuthUser,
    @Body({ schema: settingsSchema }) body: VideochatSettings,
  ): Promise<VideochatSettings> {
    return this.videochat.saveSettings(user.id, body);
  }

  /** A suspended person asks the team to lift the suspension (once per suspension). */
  @Post('appeal')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  appeal(
    @CurrentUser() user: AuthUser,
    @Body({ schema: appealSchema }) body: AppealInput,
  ): Promise<void> {
    return this.videochat.appeal(user.id, body.message);
  }

  /** A single-use ticket (30 s) to open the WebSocket, and the ICE servers for the call. Also
   * limited per account (10 a minute) in the service. */
  @Post('ticket')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  ticket(@CurrentUser() user: AuthUser): Promise<VideochatTicket> {
    return this.videochat.issueTicket(user.id);
  }
}

/** What anyone may see: how many people are in the video chat now (shown on its landing). */
@ApiTags('videochat')
@Public()
@Controller('videochat')
export class VideochatPublicController {
  private cached = { online: 0, at: 0 };

  constructor(private readonly gateway: VideochatGateway) {}

  @Get('online')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  online(): { online: number } {
    const now = Date.now();
    if (now - this.cached.at >= 10_000)
      this.cached = { online: this.gateway.stats.online, at: now };
    return { online: this.cached.online };
  }
}
