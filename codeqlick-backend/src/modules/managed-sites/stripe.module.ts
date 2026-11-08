import { Module } from '@nestjs/common';
import { StripeClient } from './stripe.client.js';

/** Stripe, shared by buying a preview online and by the portal's invoices. */
@Module({ providers: [StripeClient], exports: [StripeClient] })
export class StripeModule {}
