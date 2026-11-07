import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { onboardingSchema, type OnboardingInput } from './videochat.schemas.js';
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

  /** A single-use ticket (30 s) to open the WebSocket, and the ICE servers for the call. Also
   * limited per account (10 a minute) in the service. */
  @Post('ticket')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  ticket(@CurrentUser() user: AuthUser): Promise<VideochatTicket> {
    return this.videochat.issueTicket(user.id);
  }
}
