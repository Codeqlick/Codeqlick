import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { CloudBillingService } from '../cloud/cloud-billing.service.js';
import { SiteMaintenanceService } from './site-maintenance.service.js';
import { SitePurchasesService } from './site-purchases.service.js';
import type { StripeEvent } from './stripe.client.js';

/** A kind of Stripe payment the webhook can give events to. */
interface StripeHandler {
  handles(event: StripeEvent): boolean;
  handle(event: StripeEvent): Promise<void>;
}

/**
 * Stripe's webhook, signed with STRIPE_WEBHOOK_SECRET: websites bought online (architecture 8.2,
 * decision 20), Cloud's PRO subscriptions (4.13 "Plans and billing", decision 46) and the
 * managed sites' maintenance plan (8.2, decision 110). Each event goes to the first handler that
 * claims it; the maintenance plan comes first because Cloud billing claims every subscription
 * event and checks their metadata later. What nobody claims is a purchase's.
 */
@ApiExcludeController()
@Controller('payments')
export class StripeWebhookController {
  constructor(
    private readonly purchases: SitePurchasesService,
    private readonly billing: CloudBillingService,
    private readonly maintenance: SiteMaintenanceService,
  ) {}

  private get handlers(): StripeHandler[] {
    return [this.maintenance, this.billing];
  }

  @Public()
  @SkipThrottle()
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async stripe(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    if (!this.purchases.enabled) throw new NotFoundException('Buying online is not available');
    if (!request.rawBody || !signature) throw new BadRequestException('Not a Stripe event');
    let event: StripeEvent;
    try {
      event = this.purchases.verify(request.rawBody, signature);
    } catch {
      throw new BadRequestException('The Stripe signature does not match');
    }
    const handler = this.handlers.find((candidate) => candidate.handles(event));
    await (handler ?? this.purchases).handle(event);
    return { received: true };
  }
}
