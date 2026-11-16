import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { accountOf, type AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService } from '../mail/mail.service.js';
import {
  MAINTENANCE_ALLOWANCE,
  SITE_MAINTENANCE_KIND,
  eventKind,
  maintenanceMonth,
  maintenanceOn,
  maintenanceState,
  type MaintenanceStatus,
} from './site-maintenance.js';
import {
  maintenanceClientEmail,
  maintenanceTeamEmail,
  type MaintenanceEmailKind,
} from './site-maintenance-emails.js';
import {
  SiteMaintenanceRepository,
  type MaintenanceProject,
} from './site-maintenance.repository.js';
import { StripeClient, type StripeEvent, type StripeSubscription } from './stripe.client.js';

export interface MaintenancePrice {
  amountCents: number;
  currency: string;
  interval: string | null;
  vatPercent: number;
}

/** The plan as the landing shows it. */
export interface MaintenanceOffer {
  available: boolean;
  price: MaintenancePrice | null;
  allowance: number;
}

/** A project's plan (portal card and admin page). */
export interface MaintenanceView {
  available: boolean;
  price: MaintenancePrice | null;
  status: MaintenanceStatus;
  included: boolean;
  includedReason: string | null;
  on: boolean;
  since: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canManage: boolean;
  allowance: { limit: number; used: number; month: string };
  invoices: Array<{
    id: string;
    number: string | null;
    createdAt: string;
    totalCents: number;
    currency: string;
    status: string | null;
    url: string | null;
  }>;
}

export interface AdminMaintenanceView extends MaintenanceView {
  admin: {
    customerId: string | null;
    subscriptionId: string | null;
    subscriptionStatus: string | null;
    includedAt: string | null;
  };
}

export interface MaintenanceListItem {
  projectId: string;
  projectName: string;
  client: { id: string; name: string };
  status: MaintenanceStatus;
  included: boolean;
  includedReason: string | null;
  since: string | null;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

const PRICE_CACHE_MS = 3_600_000;
/** Statuses that keep a newer subscription from being replaced by an older one's events. */
const LIVE = new Set<MaintenanceStatus>(['ACTIVE', 'PAST_DUE']);

/**
 * The maintenance plan of managed sites (architecture 8.2, decision 110): a Stripe subscription
 * per project, made through Checkout and managed in Stripe's customer portal; the webhook sets the
 * project's state from the subscription Stripe says it has, read again on each event.
 */
@Injectable()
export class SiteMaintenanceService {
  private readonly logger = new Logger(SiteMaintenanceService.name);
  private priceCache?: { at: number; value: MaintenancePrice };

  constructor(
    private readonly repository: SiteMaintenanceRepository,
    private readonly stripe: StripeClient,
    private readonly accounts: AccountsService,
    private readonly activity: ActivityService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  /** Stripe's keys and the plan's price are set. */
  get enabled(): boolean {
    return this.config.maintenancePriceId !== undefined;
  }

  private async price(): Promise<MaintenancePrice | null> {
    const id = this.config.maintenancePriceId;
    if (!id) return null;
    if (this.priceCache && Date.now() - this.priceCache.at < PRICE_CACHE_MS) {
      return this.priceCache.value;
    }
    try {
      const price = await this.stripe.price(id);
      if (!price.active) return null;
      const value = {
        amountCents: price.amount,
        currency: price.currency,
        interval: price.interval,
        vatPercent: this.config.siteVatPercent,
      };
      this.priceCache = { at: Date.now(), value };
      return value;
    } catch (error) {
      this.logger.error(`The maintenance price couldn't be read from Stripe: ${String(error)}`);
      return null;
    }
  }

  /** For the landing (`GET /site-maintenance/offer`). */
  async offer(): Promise<MaintenanceOffer> {
    const price = await this.price();
    return { available: price !== null, price, allowance: MAINTENANCE_ALLOWANCE };
  }

  // ── Portal ─────────────────────────────────────────────────────────────────────────────────

  async view(caller: AuthUser, projectId: string, now = new Date()): Promise<MaintenanceView> {
    return this.toView(await this.findOwn(caller, projectId), now);
  }

  async checkout(caller: AuthUser, projectId: string, locale: ApiLocale): Promise<{ url: string }> {
    const project = await this.findOwn(caller, projectId);
    if (caller.role !== 'CLIENT') throw new ForbiddenException('The client takes the plan');
    const priceId = this.config.maintenancePriceId;
    if (!priceId) throw new NotFoundException('The maintenance plan is not available');
    if (maintenanceOn(project.maintenanceStatus, project.maintenanceIncludedReason)) {
      throw new ConflictException('The maintenance plan is already on');
    }
    const metadata = { kind: SITE_MAINTENANCE_KIND, projectId: project.id };
    let customer = project.maintenanceCustomerId;
    if (!customer) {
      customer = await this.stripe.createCustomer({
        email: caller.email,
        name: project.name,
        metadata,
      });
      await this.repository.update(project.id, { maintenanceCustomerId: customer });
    }
    const vat = this.config.siteVatPercent;
    const taxRates = vat > 0 ? [await this.stripe.taxRate(vat)] : [];
    const back = this.cardUrl(project.id, locale);
    const session = await this.stripe.createCheckout({
      mode: 'subscription',
      customer,
      client_reference_id: project.id,
      line_items: [
        { price: priceId, quantity: 1, ...(taxRates.length > 0 ? { tax_rates: taxRates } : {}) },
      ],
      metadata,
      subscription_data: { metadata },
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      customer_update: { address: 'auto', name: 'auto' },
      locale: locale === 'es' ? 'es' : 'en',
      success_url: `${back}?maintenance=done`,
      cancel_url: `${back}?maintenance=canceled`,
    });
    return { url: session.url };
  }

  async portal(caller: AuthUser, projectId: string, locale: ApiLocale): Promise<{ url: string }> {
    const project = await this.findOwn(caller, projectId);
    if (caller.role !== 'CLIENT') throw new ForbiddenException('The client manages the plan');
    if (!this.stripe.enabled) throw new NotFoundException('The maintenance plan is not available');
    if (!project.maintenanceCustomerId) {
      throw new ConflictException('The project has no maintenance plan to manage');
    }
    return {
      url: await this.stripe.portal(
        project.maintenanceCustomerId,
        this.cardUrl(project.id, locale),
      ),
    };
  }

  // ── Admin ──────────────────────────────────────────────────────────────────────────────────

  async adminView(projectId: string, now = new Date()): Promise<AdminMaintenanceView> {
    const project = await this.find(projectId);
    return {
      ...(await this.toView(project, now)),
      admin: {
        customerId: project.maintenanceCustomerId,
        subscriptionId: project.maintenanceSubscriptionId,
        subscriptionStatus: project.maintenanceSubscriptionStatus,
        includedAt: project.maintenanceIncludedAt?.toISOString() ?? null,
      },
    };
  }

  /** Marks the plan included for free (with why), or removes it. */
  async setIncluded(
    caller: AuthUser,
    projectId: string,
    reason: string | null,
  ): Promise<AdminMaintenanceView> {
    const project = await this.find(projectId);
    if (reason !== null && LIVE.has(project.maintenanceStatus)) {
      throw new ConflictException('The client already pays the maintenance plan');
    }
    if (reason === null && project.maintenanceIncludedReason === null) {
      return this.adminView(projectId);
    }
    await this.repository.update(projectId, {
      maintenanceIncludedReason: reason,
      maintenanceIncludedAt: reason === null ? null : new Date(),
    });
    await this.activity.record(caller, {
      action: reason === null ? 'project.maintenance_removed' : 'project.maintenance_included',
      targetId: projectId,
      targetLabel: project.name,
      ...(reason === null ? {} : { details: { reason } }),
    });
    return this.adminView(projectId);
  }

  /** Every project whose plan is or was on, with the monthly revenue of the paid ones. */
  async list(): Promise<{
    items: MaintenanceListItem[];
    paidCount: number;
    includedCount: number;
    mrrCents: number | null;
  }> {
    const rows = await this.repository.plans();
    const items = rows.map((row) => ({
      projectId: row.id,
      projectName: row.name,
      client: row.client,
      status: row.maintenanceStatus,
      included: row.maintenanceIncludedReason !== null,
      includedReason: row.maintenanceIncludedReason,
      since: (row.maintenanceSince ?? row.maintenanceIncludedAt)?.toISOString() ?? null,
      periodEnd: row.maintenancePeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: row.maintenanceCancelAtPeriodEnd,
    }));
    const paidCount = items.filter((item) => LIVE.has(item.status)).length;
    const price = await this.price();
    return {
      items,
      paidCount,
      includedCount: items.filter((item) => item.included).length,
      mrrCents: price ? paidCount * price.amountCents : paidCount === 0 ? 0 : null,
    };
  }

  // ── Stripe's webhook ───────────────────────────────────────────────────────────────────────

  /** Whether an event is about a maintenance plan, by its metadata (decision 110). */
  handles(event: StripeEvent): boolean {
    const object = event.data.object as Parameters<typeof eventKind>[0];
    return eventKind(object) === SITE_MAINTENANCE_KIND;
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
        const projectId = invoice.parent?.subscription_details?.metadata?.projectId;
        const customer =
          typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id;
        const project =
          (projectId ? await this.repository.project(projectId) : null) ??
          (customer ? await this.repository.projectByCustomer(customer) : null);
        if (project) await this.tell(project, 'failed');
        return;
      }
      default:
        return;
    }
  }

  private async sync(subscription: StripeSubscription): Promise<void> {
    const metadata = subscription.metadata ?? {};
    if (metadata.kind !== SITE_MAINTENANCE_KIND) return;
    const customer =
      typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
    const project =
      (metadata.projectId ? await this.repository.project(metadata.projectId) : null) ??
      (await this.repository.projectByCustomer(customer));
    if (!project) {
      this.logger.error(`Maintenance subscription ${subscription.id} names no project`);
      return;
    }
    const state = maintenanceState(subscription);
    // A newer subscription replaces an older one; an older one's events don't touch a newer.
    if (
      project.maintenanceSubscriptionId &&
      project.maintenanceSubscriptionId !== subscription.id &&
      LIVE.has(project.maintenanceStatus) &&
      !LIVE.has(state.maintenanceStatus)
    ) {
      return;
    }
    const wasOn = LIVE.has(project.maintenanceStatus);
    const isOn = LIVE.has(state.maintenanceStatus);
    const updated = await this.repository.update(project.id, {
      ...state,
      maintenanceCustomerId: customer,
      ...(isOn && !wasOn ? { maintenanceSince: new Date() } : {}),
    });
    if (state.maintenanceStatus !== project.maintenanceStatus) {
      await this.activity.record(
        { id: null, name: 'Stripe' },
        {
          action: 'project.maintenance_changed',
          targetId: project.id,
          targetLabel: project.name,
          details: { from: project.maintenanceStatus, to: state.maintenanceStatus },
        },
      );
    }
    if (isOn && !wasOn) await this.tell(updated, 'active');
    else if (wasOn && state.maintenanceStatus === 'CANCELED') await this.tell(updated, 'ended');
  }

  /** The client account's people and the team inbox. Mail failures are only logged. */
  private async tell(project: MaintenanceProject, kind: MaintenanceEmailKind): Promise<void> {
    const site = this.config.siteUrl;
    try {
      for (const person of await this.accounts.people(project.client.id)) {
        await this.mail.send(
          maintenanceClientEmail(
            person,
            kind,
            project.name,
            { card: this.cardUrl(project.id, person.locale), site },
            project.maintenancePeriodEnd,
          ),
        );
      }
      await this.mail.send(
        maintenanceTeamEmail(
          this.config.leadsNotifyTo,
          kind,
          { name: project.name, client: project.client.name },
          { admin: `${site}/es/admin/projects/${project.id}#maintenance`, site },
          {
            status: project.maintenanceSubscriptionStatus ?? project.maintenanceStatus,
            periodEnd: project.maintenancePeriodEnd,
          },
        ),
      );
    } catch (error) {
      this.logger.error(`Project ${project.id}: the plan email couldn't be sent: ${String(error)}`);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────────────────

  private cardUrl(projectId: string, locale: ApiLocale): string {
    return `${this.config.siteUrl}/${locale}/portal/projects/${projectId}/site`;
  }

  /** A project with a managed site; 404 otherwise. */
  private async find(projectId: string): Promise<MaintenanceProject> {
    const project = await this.repository.project(projectId);
    if (!project?.site) throw new NotFoundException('Website not found');
    return project;
  }

  /** As `find`, and the caller's (an admin's, or a person's of the client account). */
  private async findOwn(caller: AuthUser, projectId: string): Promise<MaintenanceProject> {
    const project = await this.repository.project(projectId);
    const own = project && (caller.role === 'ADMIN' || project.client.id === accountOf(caller));
    if (!project?.site || !own) throw new NotFoundException('Website not found');
    return project;
  }

  private async toView(project: MaintenanceProject, now: Date): Promise<MaintenanceView> {
    const month = maintenanceMonth(now);
    const [price, used, invoices] = await Promise.all([
      this.price(),
      this.repository.usedSince(project.id, month.start),
      this.invoicesOf(project.maintenanceCustomerId),
    ]);
    return {
      available: price !== null,
      price,
      status: project.maintenanceStatus,
      included: project.maintenanceIncludedReason !== null,
      includedReason: project.maintenanceIncludedReason,
      on: maintenanceOn(project.maintenanceStatus, project.maintenanceIncludedReason),
      since: (project.maintenanceSince ?? project.maintenanceIncludedAt)?.toISOString() ?? null,
      periodEnd: project.maintenancePeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: project.maintenanceCancelAtPeriodEnd,
      canManage: project.maintenanceCustomerId !== null && this.stripe.enabled,
      allowance: { limit: MAINTENANCE_ALLOWANCE, used, month: month.key },
      invoices,
    };
  }

  /** The customer's latest invoices; none when Stripe doesn't answer. */
  private async invoicesOf(customer: string | null): Promise<MaintenanceView['invoices']> {
    if (!customer || !this.stripe.enabled) return [];
    try {
      return (await this.stripe.invoices(customer)).map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        createdAt: new Date(invoice.created * 1000).toISOString(),
        totalCents: invoice.total,
        currency: invoice.currency,
        status: invoice.status,
        url: invoice.hostedUrl,
      }));
    } catch (error) {
      this.logger.error(`The plan's invoices couldn't be read from Stripe: ${String(error)}`);
      return [];
    }
  }
}
