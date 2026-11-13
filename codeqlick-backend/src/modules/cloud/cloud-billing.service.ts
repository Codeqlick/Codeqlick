import { ConflictException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { toApiLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { MailService } from '../mail/mail.service.js';
import {
  StripeClient,
  type StripeEvent,
  type StripeSubscription,
} from '../managed-sites/stripe.client.js';
import { CLOUD_PLAN_KIND, subscriptionState } from './cloud-billing.js';
import { CloudBillingRepository } from './cloud-billing.repository.js';
import type { CloudCtx } from './cloud-caller.js';
import { cloudPlanEmail } from './cloud-emails.js';
import { CLOUD_PLANS, type CloudLimits } from './cloud-plans.js';
import { CloudRepository } from './cloud.repository.js';
import { CloudTeamsService } from './cloud-teams.service.js';

export interface BillingView {
  available: boolean;
  plan: 'FREE' | 'PRO';
  price: { amount: number; currency: string; interval: string | null; vatPercent: number } | null;
  subscription: {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
  limits: { FREE: CloudLimits; PRO: CloudLimits };
}

const PRICE_CACHE_MS = 3_600_000;

/** Cloud's PRO plan through Stripe (architecture 4.13 "Plans and billing", decision 46). */
@Injectable()
export class CloudBillingService {
  private readonly logger = new Logger(CloudBillingService.name);
  private priceCache?: { at: number; value: NonNullable<BillingView['price']> };

  constructor(
    private readonly stripe: StripeClient,
    private readonly teams: CloudTeamsService,
    private readonly cloud: CloudRepository,
    private readonly billing: CloudBillingRepository,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  get available(): boolean {
    return this.config.cloudProPriceId !== undefined;
  }

  private async price(): Promise<BillingView['price']> {
    const id = this.config.cloudProPriceId;
    if (!id) return null;
    if (this.priceCache && Date.now() - this.priceCache.at < PRICE_CACHE_MS) {
      return this.priceCache.value;
    }
    try {
      const price = await this.stripe.price(id);
      const value = { ...price, vatPercent: this.config.siteVatPercent };
      this.priceCache = { at: Date.now(), value };
      return value;
    } catch (error) {
      this.logger.error(`The PRO price couldn't be read from Stripe: ${String(error)}`);
      return null;
    }
  }

  private planUrl(slug: string, locale: ApiLocale, query = ''): string {
    return `${this.config.cloudUrl}/${locale}/console/${slug}/plan${query}`;
  }

  async view(ctx: CloudCtx, teamSlug: string): Promise<BillingView> {
    const { team } = await this.teams.access(ctx, teamSlug);
    const price = await this.price();
    return {
      available: this.available && price !== null,
      plan: team.plan,
      price,
      subscription: team.subscriptionStatus
        ? {
            status: team.subscriptionStatus,
            currentPeriodEnd: team.currentPeriodEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: team.cancelAtPeriodEnd,
          }
        : null,
      limits: CLOUD_PLANS,
    };
  }

  async checkout(ctx: CloudCtx, teamSlug: string, locale: ApiLocale): Promise<{ url: string }> {
    const { team } = await this.teams.access(ctx, teamSlug, 'OWNER');
    const priceId = this.config.cloudProPriceId;
    if (!priceId) throw new ServiceUnavailableException('Paid plans are not available yet');
    if (team.plan === 'PRO') throw new ConflictException('The team is already on PRO');
    let customer = team.stripeCustomerId;
    if (!customer) {
      customer = await this.stripe.createCustomer({
        email: ctx.user.email,
        name: team.name,
        metadata: { kind: CLOUD_PLAN_KIND, cloudTeamId: team.id, cloudTeam: team.slug },
      });
      await this.billing.update(team.id, { stripeCustomerId: customer });
    }
    const vat = this.config.siteVatPercent;
    const taxRates = vat > 0 ? [await this.stripe.taxRate(vat)] : [];
    const metadata = { kind: CLOUD_PLAN_KIND, cloudTeamId: team.id };
    const session = await this.stripe.createCheckout({
      mode: 'subscription',
      customer,
      client_reference_id: team.id,
      line_items: [{ price: priceId, quantity: 1, tax_rates: taxRates }],
      metadata,
      subscription_data: { metadata },
      locale: locale === 'es' ? 'es' : 'en',
      allow_promotion_codes: true,
      success_url: this.planUrl(team.slug, locale, '?billing=done'),
      cancel_url: this.planUrl(team.slug, locale, '?billing=canceled'),
    });
    await this.teams.record(ctx, team.id, 'billing.checkout', team.slug);
    return { url: session.url };
  }

  async portal(ctx: CloudCtx, teamSlug: string, locale: ApiLocale): Promise<{ url: string }> {
    const { team } = await this.teams.access(ctx, teamSlug, 'OWNER');
    if (!this.config.stripe)
      throw new ServiceUnavailableException('Paid plans are not available yet');
    if (!team.stripeCustomerId) throw new ConflictException('The team has no subscription');
    return {
      url: await this.stripe.portal(team.stripeCustomerId, this.planUrl(team.slug, locale)),
    };
  }

  // ── Stripe's webhook ───────────────────────────────────────────────────────────────────────

  /** Whether an event is about a Cloud plan (the rest is decision 20's purchases). */
  handles(event: StripeEvent): boolean {
    const object = event.data.object as { object?: string; mode?: string; metadata?: unknown };
    if (event.type.startsWith('customer.subscription.')) return true;
    if (event.type === 'invoice.payment_failed') return true;
    return object.object === 'checkout.session' && object.mode === 'subscription';
  }

  async handle(event: StripeEvent): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const id =
          typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription?.id;
        if (id) await this.sync(await this.stripe.subscription(id));
        return;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        // Read again: events can arrive out of order, Stripe's current state can't.
        await this.sync(await this.stripe.subscription(event.data.object.id));
        return;
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customer =
          typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        const team = customer ? await this.billing.teamByCustomer(customer) : null;
        if (team) await this.tellOwners(team.id, team.slug, team.name, 'failed');
        return;
      }
      default:
        return;
    }
  }

  private async sync(subscription: StripeSubscription): Promise<void> {
    const metadata = subscription.metadata ?? {};
    if (metadata.kind !== CLOUD_PLAN_KIND) return;
    const customer =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const team =
      (metadata.cloudTeamId ? await this.billing.team(metadata.cloudTeamId) : null) ??
      (await this.billing.teamByCustomer(customer));
    if (!team) {
      this.logger.error(`Subscription ${subscription.id} names no Cloud team`);
      return;
    }
    // A newer subscription replaces an older one; an older one's events don't touch a newer.
    if (
      team.stripeSubscriptionId &&
      team.stripeSubscriptionId !== subscription.id &&
      team.subscriptionStatus &&
      ['active', 'trialing', 'past_due'].includes(team.subscriptionStatus) &&
      !['active', 'trialing', 'past_due'].includes(subscription.status)
    ) {
      return;
    }
    const state = subscriptionState(subscription);
    await this.billing.update(team.id, { ...state, stripeCustomerId: customer });
    if (state.plan !== team.plan) {
      await this.teams.recordSystem(team.id, 'Stripe', 'plan.changed', state.plan, {
        from: team.plan,
        to: state.plan,
        status: state.subscriptionStatus,
      });
      await this.tellOwners(team.id, team.slug, team.name, state.plan === 'PRO' ? 'pro' : 'free');
    }
  }

  private async tellOwners(
    teamId: string,
    slug: string,
    name: string,
    kind: 'pro' | 'free' | 'failed',
  ): Promise<void> {
    try {
      for (const owner of await this.cloud.ownerEmails(teamId)) {
        const locale = toApiLocale(owner.locale);
        await this.mail.send(
          cloudPlanEmail({
            to: owner.email,
            locale,
            kind,
            team: name,
            url: this.planUrl(slug, locale),
            siteUrl: this.config.siteUrl,
          }),
        );
      }
    } catch (error) {
      this.logger.error(`Team ${teamId}: the plan email couldn't be sent: ${String(error)}`);
    }
  }
}
