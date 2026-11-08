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
  appointmentsQuerySchema,
  createAppointmentSchema,
  createPageSchema,
  slugParamSchema,
  tokenSchema,
  updatePageSchema,
  type AppointmentsQuery,
  type CreateAppointmentInput,
  type CreatePageInput,
  type SlugParam,
  type TokenInput,
  type UpdatePageInput,
} from './citas.schemas.js';
import {
  CitasService,
  type AppointmentView,
  type BookedView,
  type PageView,
  type PublicPage,
} from './citas.service.js';

/** A signed-in person's booking pages and the appointments made on them. */
@ApiTags('citas')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('citas')
export class CitasController {
  constructor(private readonly citas: CitasService) {}

  @Get('pages')
  async pages(@CurrentUser() user: AuthUser): Promise<{ items: PageView[] }> {
    return { items: await this.citas.listPages(user.id) };
  }

  @Post('pages')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createPage(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createPageSchema }) body: CreatePageInput,
  ): Promise<PageView> {
    return this.citas.createPage(user.id, body);
  }

  @Patch('pages/:id')
  updatePage(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updatePageSchema }) body: UpdatePageInput,
  ): Promise<PageView> {
    return this.citas.updatePage(user.id, params.id, body);
  }

  /** Deletes the page; its appointments still to come are cancelled and the people emailed. */
  @Delete('pages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePage(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.citas.deletePage(user.id, params.id);
  }

  @Get('appointments')
  async appointments(
    @CurrentUser() user: AuthUser,
    @Query({ schema: appointmentsQuerySchema }) query: AppointmentsQuery,
  ): Promise<{ items: AppointmentView[] }> {
    return { items: await this.citas.listAppointments(user.id, query.scope) };
  }

  @Post('appointments/:id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<AppointmentView> {
    return this.citas.cancelByOwner(user.id, params.id);
  }
}

/** What anyone can do: see a booking page, book on it, and cancel from the emailed link. */
@ApiTags('citas')
@Public()
@Controller('citas')
export class CitasPublicController {
  constructor(private readonly citas: CitasService) {}

  @Get('p/:slug')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  page(@Param({ schema: slugParamSchema }) params: SlugParam): Promise<PublicPage> {
    return this.citas.publicPage(params.slug);
  }

  @Post('p/:slug/appointments')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  book(
    @Param({ schema: slugParamSchema }) params: SlugParam,
    @Body({ schema: createAppointmentSchema }) body: CreateAppointmentInput,
  ): Promise<BookedView> {
    return this.citas.book(params.slug, body);
  }

  @Post('cancel/preview')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  preview(@Body({ schema: tokenSchema }) body: TokenInput): Promise<BookedView> {
    return this.citas.byToken(body.token);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  cancel(@Body({ schema: tokenSchema }) body: TokenInput): Promise<BookedView> {
    return this.citas.cancelWithToken(body.token);
  }
}
