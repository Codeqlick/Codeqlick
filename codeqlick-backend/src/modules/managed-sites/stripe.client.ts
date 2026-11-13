import { Injectable, NotFoundException } from '@nestjs/common';
import { Stripe } from 'stripe';
import { AppConfigService } from '../../config/app-config.service.js';

export type StripeEvent = Stripe.Event;
export type CheckoutSession = Stripe.Checkout.Session;
export type CheckoutParams = Stripe.Checkout.SessionCreateParams;
export type StripeSubscription = Stripe.Subscription;
export type StripeInvoice = Stripe.Invoice;

/**
 * Stripe, for buying a preview online (architecture 8.2, decision 20): Checkout Sessions, the
 * webhook's signature and the invoices' PDFs. Off while STRIPE_SECRET_KEY or
 * STRIPE_WEBHOOK_SECRET is missing.
 */
@Injectable()
export class StripeClient {
  private client: Stripe | undefined;
  private readonly taxRates = new Map<number, Promise<string>>();

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

  /**
   * The id of the tax rate "IVA <percent> %" (added to the price, Spain), found among the
   * account's active rates or created once.
   */
  taxRate(percent: number): Promise<string> {
    let rate = this.taxRates.get(percent);
    if (!rate) {
      rate = this.findOrCreateTaxRate(percent);
      // A failure is retried on the next purchase.
      rate.catch(() => this.taxRates.delete(percent));
      this.taxRates.set(percent, rate);
    }
    return rate;
  }

  private async findOrCreateTaxRate(percent: number): Promise<string> {
    const stripe = this.stripe();
    for await (const rate of stripe.taxRates.list({ active: true, inclusive: false, limit: 100 })) {
      if (rate.display_name === 'IVA' && rate.percentage === percent && rate.country === 'ES') {
        return rate.id;
      }
    }
    const created = await stripe.taxRates.create({
      display_name: 'IVA',
      description: `IVA ${percent} % (España)`,
      percentage: percent,
      inclusive: false,
      country: 'ES',
      jurisdiction: 'ES',
      tax_type: 'vat',
    });
    return created.id;
  }

  /** The PDF of an invoice Stripe issued; `null` while it has none (a draft). */
  async invoicePdf(id: string): Promise<string | null> {
    const invoice = await this.stripe().invoices.retrieve(id);
    return invoice.invoice_pdf ?? null;
  }

  /** A price's amount, currency and interval (Cloud's PRO plan, decision 46). */
  async price(
    id: string,
  ): Promise<{ amount: number; currency: string; interval: string | null; active: boolean }> {
    const price = await this.stripe().prices.retrieve(id);
    return {
      amount: price.unit_amount ?? 0,
      currency: price.currency,
      interval: price.recurring?.interval ?? null,
      active: price.active,
    };
  }

  /** A new customer; its metadata names what it pays for. */
  async createCustomer(input: {
    email: string;
    name: string;
    metadata: Record<string, string>;
  }): Promise<string> {
    const customer = await this.stripe().customers.create(input);
    return customer.id;
  }

  /** Stripe's customer portal for one customer: its address. */
  async portal(customer: string, returnUrl: string): Promise<string> {
    const session = await this.stripe().billingPortal.sessions.create({
      customer,
      return_url: returnUrl,
    });
    return session.url;
  }

  subscription(id: string): Promise<StripeSubscription> {
    return this.stripe().subscriptions.retrieve(id);
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
