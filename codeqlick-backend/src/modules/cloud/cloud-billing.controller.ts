import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CloudApi } from '../../common/decorators/cloud-api.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CloudBillingService, type BillingView } from './cloud-billing.service.js';
import { Caller, type CloudCtx } from './cloud-caller.js';
import {
  billingLinkSchema,
  teamParamSchema,
  type BillingLinkInput,
  type TeamParam,
} from './cloud.schemas.js';

/** A team's plan and its PRO subscription (architecture 4.13 "Plans and billing"). */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@CloudApi()
@Controller('cloud/teams/:team/billing')
export class CloudBillingController {
  constructor(private readonly billing: CloudBillingService) {}

  @Get()
  view(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
  ): Promise<BillingView> {
    return this.billing.view(ctx, params.team);
  }

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  checkout(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
    @Body({ schema: billingLinkSchema }) body: BillingLinkInput,
  ): Promise<{ url: string }> {
    return this.billing.checkout(ctx, params.team, body.locale);
  }

  @Post('portal')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  portal(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
    @Body({ schema: billingLinkSchema }) body: BillingLinkInput,
  ): Promise<{ url: string }> {
    return this.billing.portal(ctx, params.team, body.locale);
  }
}
