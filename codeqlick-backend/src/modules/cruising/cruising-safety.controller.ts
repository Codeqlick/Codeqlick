import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  adminCentersQuerySchema,
  contactResponseSchema,
  extendTimerSchema,
  healthCenterPatchSchema,
  healthCenterSchema,
  healthCentersQuerySchema,
  healthSchema,
  importHealthCentersSchema,
  timerSchema,
  trustedContactSchema,
  type AdminCentersQuery,
  type ContactResponseInput,
  type ExtendTimerInput,
  type HealthCenterInput,
  type HealthCenterPatch,
  type HealthCentersQuery,
  type HealthInput,
  type ImportHealthCentersInput,
  type TimerInput,
  type TrustedContactInput,
} from './cruising-safety.schemas.js';
import {
  CruisingSafetyService,
  type HealthCenterView,
  type HealthImportResult,
  type HealthView,
  type TimerView,
  type TrustedContactView,
} from './cruising-safety.service.js';
import { Realm } from '../../common/decorators/realm.decorator.js';
import { NeoqlickTargetGuard } from '../../common/guards/realm-target.guard.js';

/** What anyone can do: answer a trusted contact's invitation, and find a testing centre. */
@ApiTags('cruising')
@Public()
@Realm('NEOQLICK')
@Controller('cruising')
export class CruisingSafetyPublicController {
  constructor(private readonly safety: CruisingSafetyService) {}

  /** From the invitation (accept or refuse) or any alert's stop link (refuse). */
  @Post('trusted-contacts/respond')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  respond(@Body({ schema: contactResponseSchema }) body: ContactResponseInput): Promise<void> {
    return this.safety.respond(body);
  }

  @Get('health-centers')
  @Header('Cache-Control', 'public, max-age=300')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  centers(
    @Query({ schema: healthCentersQuerySchema }) query: HealthCentersQuery,
  ): Promise<{ items: HealthCenterView[] }> {
    return this.safety.centers(query);
  }

  @Get('health-centers/places')
  @Header('Cache-Control', 'public, max-age=300')
  centerPlaces() {
    return this.safety.centerPlaces();
  }
}

/** A member's trusted contacts, "Check on me" timer and sexual health (phase 5). */
@ApiTags('cruising')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Realm('NEOQLICK')
@Controller('cruising')
export class CruisingSafetyController {
  constructor(private readonly safety: CruisingSafetyService) {}

  @Get('trusted-contacts')
  contacts(@CurrentUser() user: AuthUser): Promise<{ items: TrustedContactView[] }> {
    return this.safety.contacts(user.id);
  }

  @Post('trusted-contacts')
  @Throttle({ default: { limit: 30, ttl: 60 * 60_000 } })
  addContact(
    @CurrentUser() user: AuthUser,
    @Body({ schema: trustedContactSchema }) body: TrustedContactInput,
  ): Promise<TrustedContactView> {
    return this.safety.addContact(user, body);
  }

  @Delete('trusted-contacts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteContact(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.safety.deleteContact(user.id, params.id);
  }

  /** My running timer, or JSON `null`. */
  @Get('timer')
  async timer(@CurrentUser() user: AuthUser, @Res() res: Response): Promise<void> {
    res.json(await this.safety.timer(user.id));
  }

  @Post('timer')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  startTimer(
    @CurrentUser() user: AuthUser,
    @Body({ schema: timerSchema }) body: TimerInput,
  ): Promise<TimerView> {
    return this.safety.startTimer(user.id, body);
  }

  @Post('timer/extend')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  extendTimer(
    @CurrentUser() user: AuthUser,
    @Body({ schema: extendTimerSchema }) body: ExtendTimerInput,
  ): Promise<TimerView> {
    return this.safety.extendTimer(user.id, body);
  }

  @Delete('timer')
  @HttpCode(HttpStatus.NO_CONTENT)
  endTimer(@CurrentUser() user: AuthUser): Promise<void> {
    return this.safety.endTimer(user.id);
  }

  @Get('health')
  health(@CurrentUser() user: AuthUser): Promise<HealthView> {
    return this.safety.health(user.id);
  }

  @Put('health')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  saveHealth(
    @CurrentUser() user: AuthUser,
    @Body({ schema: healthSchema }) body: HealthInput,
  ): Promise<HealthView> {
    return this.safety.saveHealth(user.id, body);
  }
}

/** The team's testing centres (decision 94). */
@ApiTags('admin: cruising')
@ApiBearerAuth()
@Roles('ADMIN')
@UseGuards(NeoqlickTargetGuard)
@Controller('admin/cruising/health-centers')
export class CruisingSafetyAdminController {
  constructor(private readonly safety: CruisingSafetyService) {}

  @Get()
  list(@Query({ schema: adminCentersQuerySchema }) query: AdminCentersQuery) {
    return this.safety.adminCenters(query.q);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: healthCenterSchema }) body: HealthCenterInput,
  ): Promise<{ id: string }> {
    return this.safety.createCenter(user, body);
  }

  /** A CSV or GeoJSON file of centres, or its dry run (like the spots' import). */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  import(
    @CurrentUser() user: AuthUser,
    @Body({ schema: importHealthCentersSchema }) body: ImportHealthCentersInput,
  ): Promise<HealthImportResult> {
    return this.safety.importCenters(user, body);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: healthCenterPatchSchema }) body: HealthCenterPatch,
  ): Promise<void> {
    return this.safety.updateCenter(user, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.safety.deleteCenter(user, params.id);
  }
}
