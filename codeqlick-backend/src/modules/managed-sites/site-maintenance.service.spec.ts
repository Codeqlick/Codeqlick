import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { AccountsService } from '../accounts/accounts.service.js';
import type { ActivityService } from '../activity/activity.service.js';
import type { CloudBillingService } from '../cloud/cloud-billing.service.js';
import type { MailMessage, MailService } from '../mail/mail.service.js';
import type {
  MaintenanceProject,
  SiteMaintenanceRepository,
} from './site-maintenance.repository.js';
import { SiteMaintenanceService } from './site-maintenance.service.js';
import type { SitePurchasesService } from './site-purchases.service.js';
import { StripeWebhookController } from './stripe-webhook.controller.js';
import type { StripeClient, StripeEvent, StripeSubscription } from './stripe.client.js';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const CLIENT = '22222222-2222-4222-8222-222222222222';
const client: AuthUser = {
  id: CLIENT,
  email: 'marta@x.test',
  name: 'Marta',
  role: 'CLIENT',
  realm: 'CODEQLICK',
};
const admin: AuthUser = {
  id: 'admin',
  email: 'luis@x.test',
  name: 'Luis',
  role: 'ADMIN',
  realm: 'CODEQLICK',
};

function projectRow(overrides: Partial<MaintenanceProject> = {}): MaintenanceProject {
  return {
    id: PROJECT,
    name: 'Peluquería Marta',
    maintenanceStatus: 'NONE',
    maintenanceSubscriptionStatus: null,
    maintenanceSubscriptionId: null,
    maintenanceCustomerId: null,
    maintenancePeriodEnd: null,
    maintenanceCancelAtPeriodEnd: false,
    maintenanceSince: null,
    maintenanceIncludedReason: null,
    maintenanceIncludedAt: null,
    updatedAt: new Date(),
    client: { id: CLIENT, name: 'Marta' },
    site: { slug: 'marta', domain: null },
    ...overrides,
  };
}

function subscription(status: string, id = 'sub_1'): StripeSubscription {
  return {
    id,
    object: 'subscription',
    status,
    customer: 'cus_1',
    cancel_at_period_end: false,
    metadata: { kind: 'site-maintenance', projectId: PROJECT },
    items: { data: [{ current_period_end: 1_900_000_000 }] },
  } as unknown as StripeSubscription;
}

const event = (type: string, object: Record<string, unknown>) =>
  ({ id: 'evt_1', type, data: { object } }) as unknown as StripeEvent;

describe('SiteMaintenanceService', () => {
  let row: MaintenanceProject;
  let priceId: string | undefined;
  const sent: MailMessage[] = [];
  const repository = {
    project: vi.fn(() => Promise.resolve(row)),
    projectByCustomer: vi.fn(() => Promise.resolve(row)),
    update: vi.fn((_id: string, data: Partial<MaintenanceProject>) => {
      row = { ...row, ...data };
      return Promise.resolve(row);
    }),
    usedSince: vi.fn(() => Promise.resolve(1)),
    plans: vi.fn(() => Promise.resolve([row])),
  };
  const stripe = {
    enabled: true,
    price: vi.fn(() =>
      Promise.resolve({ amount: 1900, currency: 'eur', interval: 'month', active: true }),
    ),
    createCustomer: vi.fn(() => Promise.resolve('cus_1')),
    taxRate: vi.fn(() => Promise.resolve('txr_iva21')),
    createCheckout: vi.fn(() => Promise.resolve({ id: 'cs_1', url: 'https://checkout/1' })),
    portal: vi.fn(() => Promise.resolve('https://portal/1')),
    invoices: vi.fn(() =>
      Promise.resolve([
        {
          id: 'in_1',
          number: 'CQ-0001',
          created: 1_800_000_000,
          total: 2299,
          currency: 'eur',
          status: 'paid',
          hostedUrl: 'https://invoice/1',
        },
      ]),
    ),
    subscription: vi.fn(() => Promise.resolve(subscription('active'))),
  };
  const accounts = {
    people: vi.fn(() =>
      Promise.resolve([
        { id: CLIENT, name: 'Marta', email: 'marta@x.test', locale: 'es', registered: true },
      ]),
    ),
  };
  const activity = { record: vi.fn(() => Promise.resolve()) };
  const mail = {
    send: vi.fn((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    }),
  };
  const config = {
    get maintenancePriceId() {
      return priceId;
    },
    siteVatPercent: 21,
    siteUrl: 'https://codeqlick.com',
    leadsNotifyTo: 'hello@codeqlick.com',
  };
  const service = new SiteMaintenanceService(
    repository as unknown as SiteMaintenanceRepository,
    stripe as unknown as StripeClient,
    accounts as unknown as AccountsService,
    activity as unknown as ActivityService,
    mail as unknown as MailService,
    config as unknown as AppConfigService,
  );

  beforeEach(() => {
    row = projectRow();
    priceId = 'price_maint';
    sent.length = 0;
    vi.clearAllMocks();
  });

  it('shows the plan with its price, counter and invoices', async () => {
    row = projectRow({ maintenanceCustomerId: 'cus_1' });
    const view = await service.view(client, PROJECT, new Date('2026-11-20T10:00:00Z'));
    expect(view).toMatchObject({
      available: true,
      price: { amountCents: 1900, currency: 'eur', interval: 'month', vatPercent: 21 },
      status: 'NONE',
      on: false,
      canManage: true,
      allowance: { limit: 3, used: 1, month: '2026-11' },
      invoices: [{ id: 'in_1', number: 'CQ-0001', totalCents: 2299, url: 'https://invoice/1' }],
    });
  });

  it('hides the plan while the price is unset', async () => {
    priceId = undefined;
    expect((await service.offer()).available).toBe(false);
    expect((await service.view(client, PROJECT)).available).toBe(false);
    await expect(service.checkout(client, PROJECT, 'es')).rejects.toThrow(/not available/);
  });

  it("refuses another account's project and projects without a site", async () => {
    await expect(service.view({ ...client, id: 'someone-else' }, PROJECT)).rejects.toThrow(
      /not found/,
    );
    row = projectRow({ site: null });
    await expect(service.view(client, PROJECT)).rejects.toThrow(/not found/);
  });

  it('makes the customer once and a subscription Checkout with the metadata', async () => {
    const result = await service.checkout(client, PROJECT, 'es');
    expect(result.url).toBe('https://checkout/1');
    expect(stripe.createCustomer).toHaveBeenCalledWith({
      email: 'marta@x.test',
      name: 'Peluquería Marta',
      metadata: { kind: 'site-maintenance', projectId: PROJECT },
    });
    expect(stripe.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        customer: 'cus_1',
        client_reference_id: PROJECT,
        line_items: [{ price: 'price_maint', quantity: 1, tax_rates: ['txr_iva21'] }],
        metadata: { kind: 'site-maintenance', projectId: PROJECT },
        subscription_data: { metadata: { kind: 'site-maintenance', projectId: PROJECT } },
        success_url: `https://codeqlick.com/es/portal/projects/${PROJECT}/site?maintenance=done`,
      }),
    );
    await service.checkout(client, PROJECT, 'es');
    expect(stripe.createCustomer).toHaveBeenCalledTimes(1);
  });

  it('refuses a second plan and admins paying for the client', async () => {
    await expect(service.checkout(admin, PROJECT, 'es')).rejects.toThrow(/client/);
    row = projectRow({ maintenanceStatus: 'ACTIVE' });
    await expect(service.checkout(client, PROJECT, 'es')).rejects.toThrow(/already on/);
    row = projectRow({ maintenanceIncludedReason: 'Gratis' });
    await expect(service.checkout(client, PROJECT, 'es')).rejects.toThrow(/already on/);
  });

  it('opens the customer portal only with a customer', async () => {
    await expect(service.portal(client, PROJECT, 'en')).rejects.toThrow(/no maintenance plan/);
    row = projectRow({ maintenanceCustomerId: 'cus_1' });
    expect(await service.portal(client, PROJECT, 'en')).toEqual({ url: 'https://portal/1' });
    expect(stripe.portal).toHaveBeenCalledWith(
      'cus_1',
      `https://codeqlick.com/en/portal/projects/${PROJECT}/site`,
    );
  });

  it('follows the subscription Stripe reports and emails each change once', async () => {
    await service.handle(event('customer.subscription.created', { id: 'sub_1' }));
    expect(row).toMatchObject({
      maintenanceStatus: 'ACTIVE',
      maintenanceSubscriptionId: 'sub_1',
      maintenanceCustomerId: 'cus_1',
      maintenancePeriodEnd: new Date(1_900_000_000_000),
    });
    expect(row.maintenanceSince).toBeInstanceOf(Date);
    expect(sent.map((m) => m.subject)).toEqual([
      'Tu plan de mantenimiento está activo: Peluquería Marta',
      '[codeqlick] A maintenance plan is active: Peluquería Marta',
    ]);
    expect(sent[0]!.html).toBeDefined();

    // The same state again: nothing new to tell.
    await service.handle(event('customer.subscription.updated', { id: 'sub_1' }));
    expect(sent).toHaveLength(2);

    // Retried: still on, no email from the status; the failed invoice tells them.
    stripe.subscription.mockResolvedValueOnce(subscription('past_due'));
    await service.handle(event('customer.subscription.updated', { id: 'sub_1' }));
    expect(row.maintenanceStatus).toBe('PAST_DUE');
    expect(sent).toHaveLength(2);
    await service.handle(
      event('invoice.payment_failed', {
        customer: 'cus_1',
        parent: { subscription_details: { metadata: { projectId: PROJECT } } },
      }),
    );
    expect(sent.slice(2).map((m) => m.subject)).toEqual([
      'No hemos podido cobrar el plan de mantenimiento: Peluquería Marta',
      '[codeqlick] A maintenance plan’s payment failed: Peluquería Marta',
    ]);

    stripe.subscription.mockResolvedValueOnce(subscription('canceled'));
    await service.handle(event('customer.subscription.deleted', { id: 'sub_1' }));
    expect(row.maintenanceStatus).toBe('CANCELED');
    expect(sent.slice(4).map((m) => m.subject)).toEqual([
      'Tu plan de mantenimiento ha terminado: Peluquería Marta',
      '[codeqlick] A maintenance plan ended: Peluquería Marta',
    ]);
    expect(activity.record).toHaveBeenCalledTimes(3);
  });

  it("never lets an older subscription's events touch a newer one that is on", async () => {
    row = projectRow({ maintenanceStatus: 'ACTIVE', maintenanceSubscriptionId: 'sub_new' });
    stripe.subscription.mockResolvedValueOnce(subscription('canceled', 'sub_old'));
    await service.handle(event('customer.subscription.deleted', { id: 'sub_old' }));
    expect(row).toMatchObject({
      maintenanceStatus: 'ACTIVE',
      maintenanceSubscriptionId: 'sub_new',
    });
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("ignores subscriptions that aren't a maintenance plan", async () => {
    stripe.subscription.mockResolvedValueOnce({
      ...subscription('active'),
      metadata: { kind: 'cloud-pro' },
    } as unknown as StripeSubscription);
    await service.handle(event('customer.subscription.updated', { id: 'sub_1' }));
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('marks a project included, but not one the client pays', async () => {
    const view = await service.setIncluded(admin, PROJECT, 'Incluido en el proyecto a medida');
    expect(view).toMatchObject({
      included: true,
      on: true,
      includedReason: 'Incluido en el proyecto a medida',
    });
    expect(activity.record).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ action: 'project.maintenance_included' }),
    );
    await service.setIncluded(admin, PROJECT, null);
    expect(row.maintenanceIncludedReason).toBeNull();
    row = projectRow({ maintenanceStatus: 'PAST_DUE' });
    await expect(service.setIncluded(admin, PROJECT, 'Gratis')).rejects.toThrow(/already pays/);
  });

  it('adds the paid plans that are on to the MRR', async () => {
    row = projectRow({ maintenanceStatus: 'ACTIVE', maintenanceSince: new Date() });
    repository.plans.mockResolvedValueOnce([
      row,
      projectRow({ id: 'b', maintenanceStatus: 'PAST_DUE', maintenanceSince: new Date() }),
      projectRow({ id: 'c', maintenanceStatus: 'CANCELED', maintenanceSince: new Date() }),
      projectRow({
        id: 'd',
        maintenanceIncludedReason: 'Gratis',
        maintenanceIncludedAt: new Date(),
      }),
    ]);
    expect(await service.list()).toMatchObject({ paidCount: 2, includedCount: 1, mrrCents: 3800 });
  });
});

describe('Stripe webhook dispatch', () => {
  const handled: string[] = [];
  const handler = (name: string, claims: (event: StripeEvent) => boolean) => ({
    handles: claims,
    handle: vi.fn(() => {
      handled.push(name);
      return Promise.resolve();
    }),
  });
  const maintenance = handler(
    'maintenance',
    (e) =>
      (e.data.object as { metadata?: { kind?: string } }).metadata?.kind === 'site-maintenance',
  );
  const billing = handler('billing', (e) => e.type.startsWith('customer.subscription.'));
  const purchases = {
    ...handler('purchases', () => false),
    enabled: true,
    verify: vi.fn((payload: Buffer) => JSON.parse(payload.toString()) as StripeEvent),
  };
  const controller = new StripeWebhookController(
    purchases as unknown as SitePurchasesService,
    billing as unknown as CloudBillingService,
    maintenance as unknown as SiteMaintenanceService,
  );
  const send = (type: string, metadata: Record<string, string>) =>
    controller.stripe(
      { rawBody: Buffer.from(JSON.stringify({ type, data: { object: { metadata } } })) } as never,
      'sig',
    );

  it('gives each event to the first handler that claims it', async () => {
    await send('customer.subscription.updated', { kind: 'site-maintenance' });
    await send('customer.subscription.updated', { kind: 'cloud-pro' });
    await send('checkout.session.completed', { purchaseId: 'p' });
    expect(handled).toEqual(['maintenance', 'billing', 'purchases']);
  });

  it('refuses a forged signature', async () => {
    purchases.verify.mockImplementationOnce(() => {
      throw new Error('bad signature');
    });
    await expect(send('checkout.session.completed', {})).rejects.toThrow(/signature/);
  });
});
