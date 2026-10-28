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
import { SitePurchasesService } from './site-purchases.service.js';
import type { StripeEvent } from './stripe.client.js';

/** Stripe's webhook (architecture 8.2, decision 20): signed with STRIPE_WEBHOOK_SECRET. */
@ApiExcludeController()
@Controller('payments')
export class StripeWebhookController {
  constructor(private readonly purchases: SitePurchasesService) {}

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
    await this.purchases.handle(event);
    return { received: true };
  }
}
