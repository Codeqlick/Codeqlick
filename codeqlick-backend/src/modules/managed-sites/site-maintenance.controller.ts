import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, localeSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  SiteMaintenanceService,
  type AdminMaintenanceView,
  type MaintenanceListItem,
  type MaintenanceOffer,
  type MaintenanceView,
} from './site-maintenance.service.js';

const linkBodySchema = z.object({ locale: localeSchema.default('es') }).strict();
type LinkBody = z.infer<typeof linkBodySchema>;
const includedBodySchema = z
  .object({ reason: z.string().trim().min(3).max(300).nullable() })
  .strict();
type IncludedBody = z.infer<typeof includedBodySchema>;

/** The maintenance plan for the landing (architecture 8.2, decision 110). */
@ApiTags('site-maintenance')
@Controller('site-maintenance')
export class SiteMaintenanceOfferController {
  constructor(private readonly maintenance: SiteMaintenanceService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('offer')
  offer(): Promise<MaintenanceOffer> {
    return this.maintenance.offer();
  }
}

/** A project's maintenance plan in the client portal. */
@ApiTags('portal/maintenance')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('portal/projects/:id/maintenance')
export class PortalMaintenanceController {
  constructor(private readonly maintenance: SiteMaintenanceService) {}

  @Get()
  view(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<MaintenanceView> {
    return this.maintenance.view(user, params.id);
  }

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  checkout(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: linkBodySchema }) body: LinkBody,
  ): Promise<{ url: string }> {
    return this.maintenance.checkout(user, params.id, body.locale);
  }

  @Post('portal')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  portal(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: linkBodySchema }) body: LinkBody,
  ): Promise<{ url: string }> {
    return this.maintenance.portal(user, params.id, body.locale);
  }
}

/** The team's side: every plan, and "included" for free. */
@ApiTags('admin/maintenance')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminMaintenanceController {
  constructor(private readonly maintenance: SiteMaintenanceService) {}

  @Get('maintenance')
  list(): Promise<{
    items: MaintenanceListItem[];
    paidCount: number;
    includedCount: number;
    mrrCents: number | null;
  }> {
    return this.maintenance.list();
  }

  @Get('projects/:id/maintenance')
  view(@Param({ schema: idParamSchema }) params: IdParam): Promise<AdminMaintenanceView> {
    return this.maintenance.adminView(params.id);
  }

  @Put('projects/:id/maintenance/included')
  setIncluded(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: includedBodySchema }) body: IncludedBody,
  ): Promise<AdminMaintenanceView> {
    return this.maintenance.setIncluded(user, params.id, body.reason);
  }
}
