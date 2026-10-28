import { Injectable, NotFoundException } from '@nestjs/common';
import { Stripe } from 'stripe';
import { AppConfigService } from '../../config/app-config.service.js';

export type StripeEvent = Stripe.Event;
export type CheckoutSession = Stripe.Checkout.Session;
export type CheckoutParams = Stripe.Checkout.SessionCreateParams;

/**
 * Stripe, for buying a preview online (architecture 8.2, decision 20): Checkout Sessions and the
 * webhook's signature. Off while STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is missing.
 */
@Injectable()
export class StripeClient {
  private client: Stripe | undefined;

  constructor(private readonly config: AppConfigService) {}

  get enabled(): boolean {
    return this.config.stripe !== undefined;
  }

  /** The Checkout Session to pay on Stripe's page: its id and address. */
  async createCheckout(params: CheckoutParams): Promise<{ id: string; url: string }> {
    const session = await this.stripe().checkout.sessions.create(params);
    if (!session.url) throw new Error('Stripe returned a Checkout Session without its address');
    return { id: session.id, url: session.url };
  }

  /** The webhook's event, once its signature is checked; throws when it doesn't match. */
  event(payload: Buffer, signature: string): StripeEvent {
    const { webhookSecret } = this.settings();
    return this.stripe().webhooks.constructEvent(payload, signature, webhookSecret);
  }

  private stripe(): Stripe {
    this.client ??= new Stripe(this.settings().secretKey);
    return this.client;
  }

  private settings(): { secretKey: string; webhookSecret: string } {
    const settings = this.config.stripe;
    if (!settings) throw new NotFoundException('Buying online is not available');
    return settings;
  }
}
