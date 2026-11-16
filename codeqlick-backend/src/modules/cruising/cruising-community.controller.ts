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
import {
  attendanceSchema,
  meetupSchema,
  meetupsQuerySchema,
  safetyAlertSchema,
  safetyBoxQuerySchema,
  tripSchema,
  type AttendanceInput,
  type MeetupInput,
  type MeetupsQuery,
  type SafetyAlertInput,
  type SafetyBoxQuery,
  type TripInput,
} from './cruising-community.schemas.js';
import {
  CruisingCommunityService,
  type CruisingMeetupView,
  type CruisingSafetyAlertView,
  type CruisingTripView,
  type CruisingVisitorView,
} from './cruising-community.service.js';
import { placeParamsSchema, type PlaceParams } from './cruising.schemas.js';

/**
 * Cruising's phase 5 (architecture 4.15): meetups (decision 88), trips (decision 90) and safety
 * alerts (decision 91). Any signed-in account that entered; the service checks the rest.
 */
@ApiTags('cruising')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('cruising')
export class CruisingCommunityController {
  constructor(private readonly community: CruisingCommunityService) {}

  // ---- Meetups -----------------------------------------------------------------------------------

  @Get('meetups')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  meetups(
    @CurrentUser() user: AuthUser,
    @Query({ schema: meetupsQuerySchema }) query: MeetupsQuery,
  ): Promise<{ items: CruisingMeetupView[] }> {
    return this.community.meetups(user.id, query);
  }

  @Post('meetups')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createMeetup(
    @CurrentUser() user: AuthUser,
    @Body({ schema: meetupSchema }) body: MeetupInput,
  ): Promise<CruisingMeetupView> {
    return this.community.createMeetup(user.id, body);
  }

  @Put('meetups/:id/attendance')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  attend(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: attendanceSchema }) body: AttendanceInput,
  ): Promise<void> {
    return this.community.attend(user.id, params.id, body.anonymous);
  }

  @Delete('meetups/:id/attendance')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  leave(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.community.leave(user.id, params.id);
  }

  @Delete('meetups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  cancelMeetup(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.community.cancelMeetup(user.id, params.id);
  }

  // ---- Trips -------------------------------------------------------------------------------------

  @Get('trips')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  trips(@CurrentUser() user: AuthUser): Promise<{ items: CruisingTripView[] }> {
    return this.community.trips(user.id);
  }

  @Post('trips')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createTrip(
    @CurrentUser() user: AuthUser,
    @Body({ schema: tripSchema }) body: TripInput,
  ): Promise<Omit<CruisingTripView, 'spots' | 'meetups'>> {
    return this.community.createTrip(user.id, body);
  }

  @Delete('trips/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  deleteTrip(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.community.deleteTrip(user.id, params.id);
  }

  @Get('places/:countryCode/:citySlug/visitors')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  visitors(
    @CurrentUser() user: AuthUser,
    @Param({ schema: placeParamsSchema }) params: PlaceParams,
  ): Promise<{ items: CruisingVisitorView[] }> {
    return this.community.visitors(user.id, params.countryCode, params.citySlug);
  }

  // ---- Safety alerts -----------------------------------------------------------------------------

  /** The spots of a box of the map with active alerts; the web asks by grid cell. */
  @Get('alerts')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  safetyInBox(
    @CurrentUser() user: AuthUser,
    @Query({ schema: safetyBoxQuerySchema }) query: SafetyBoxQuery,
  ): Promise<{ items: { spotId: string; alerts: number }[] }> {
    return this.community.safetyInBox(user.id, query.bbox);
  }

  @Get('spots/:id/alerts')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  safetyAlerts(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<{ items: CruisingSafetyAlertView[] }> {
    return this.community.safetyAlerts(user.id, params.id);
  }

  @Post('spots/:id/alerts')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createSafetyAlert(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: safetyAlertSchema }) body: SafetyAlertInput,
  ): Promise<CruisingSafetyAlertView> {
    return this.community.createSafetyAlert(user.id, params.id, body);
  }

  @Post('alerts/:id/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  confirm(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.community.voteSafetyAlert(user.id, params.id, 'CONFIRM');
  }

  @Post('alerts/:id/gone')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  gone(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.community.voteSafetyAlert(user.id, params.id, 'GONE');
  }
}
