import {
  Body,
  Controller,
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
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  bookingConfigSchema,
  cancelBookingSchema,
  createBookingSchema,
  listBookingsQuerySchema,
  type BookingConfig,
  type CancelBookingInput,
  type CreateBookingInput,
  type ListBookingsQuery,
} from './bookings.schemas.js';
import { BookingsService, type BookingView } from './bookings.service.js';

@ApiTags('bookings')
@Controller()
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  /** Free slots (ISO instants) for the website; 404 until the page is published. */
  @Public()
  @Get('bookings/slots')
  slots() {
    return this.bookings.publicSlots();
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('bookings')
  book(@Body({ schema: createBookingSchema }) body: CreateBookingInput) {
    return this.bookings.book(body);
  }

  /** From the visitor's email link. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('bookings/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Body({ schema: cancelBookingSchema }) body: CancelBookingInput) {
    return this.bookings.cancelWithToken(body.token);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('admin/bookings')
  list(
    @Query({ schema: listBookingsQuerySchema }) query: ListBookingsQuery,
  ): Promise<BookingView[]> {
    return this.bookings.list(query.scope);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('admin/bookings/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancelByTeam(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<BookingView> {
    return this.bookings.cancelByTeam(user, params.id);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('admin/booking-settings')
  getConfig(): Promise<BookingConfig> {
    return this.bookings.getConfig();
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Put('admin/booking-settings')
  saveConfig(
    @CurrentUser() user: AuthUser,
    @Body({ schema: bookingConfigSchema }) body: BookingConfig,
  ): Promise<BookingConfig> {
    return this.bookings.saveConfig(user, body);
  }
}
