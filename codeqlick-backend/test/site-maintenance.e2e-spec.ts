import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { Stripe } from 'stripe';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { AppConfigService } from '../src/config/app-config.service.js';
import { Role } from '../src/generated/prisma/client.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import {
  StripeClient,
  type CheckoutParams,
  type StripeSubscription,
} from '../src/modules/managed-sites/stripe.client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const WEBHOOK_SECRET = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_e2e';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_e2e_maintenance';
  process.env.STRIPE_MAINTENANCE_PRICE_ID = 'price_maintenance';
  return 'whsec_e2e_maintenance';
});

const signer = new Stripe('sk_test_e2e');
const tag = randomUUID().slice(0, 8);
const password = 'maintenance-password-1';
const admin = { email: `e2e-maint-admin-${tag}@codeqlick.test`, password };
const client = { email: `e2e-maint-client-${tag}@codeqlick.test`, password };
const other = { email: `e2e-maint-other-${tag}@codeqlick.test`, password };

function signed(type: string, object: Record<string, unknown>, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify({
    id: `evt_${randomUUID().replaceAll('-', '')}`,
    object: 'event',
    type,
    data: { object },
  });
  return { payload, signature: signer.webhooks.generateTestHeaderString({ payload, secret }) };
}

describe('Maintenance plan of managed sites (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];
  const checkouts: CheckoutParams[] = [];
  const subscriptions = new Map<string, StripeSubscription>();
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
      rawBody: true,
    });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const stripe = app.get(StripeClient);
    vi.spyOn(stripe, 'taxRate').mockResolvedValue('txr_iva21');
    vi.spyOn(stripe, 'price').mockResolvedValue({
      amount: 1900,
      currency: 'eur',
      interval: 'month',
      active: true,
    });
    vi.spyOn(stripe, 'createCustomer').mockResolvedValue(`cus_${tag}`);
    vi.spyOn(stripe, 'createCheckout').mockImplementation((params) => {
      checkouts.push(params);
      return Promise.resolve({ id: `cs_${tag}`, url: 'https://checkout.stripe.com/maintenance' });
    });
    vi.spyOn(stripe, 'portal').mockResolvedValue('https://billing.stripe.com/maintenance');
    vi.spyOn(stripe, 'invoices').mockResolvedValue([
      {
        id: 'in_1',
        number: 'CQ-0001',
        created: 1_800_000_000,
        total: 2299,
        currency: 'eur',
        status: 'paid',
        hostedUrl: 'https://invoice.stripe.com/i/1',
      },
    ]);
    vi.spyOn(stripe, 'subscription').mockImplementation((id) =>
      Promise.resolve(subscriptions.get(id)!),
    );
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message) => {
      sent.push(message);
      return Promise.resolve();
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: 'Luis', role: Role.ADMIN, passwordHash },
    });
    ids.client = (
      await prisma.user.create({
        data: {
          email: client.email,
          name: 'Marta',
          locale: 'ES',
          role: Role.CLIENT,
          passwordHash,
          registeredAt: new Date(),
        },
      })
    ).id;
    await prisma.user.create({
      data: { email: other.email, name: 'Ada', role: Role.CLIENT, passwordHash },
    });
    ids.project = (
      await prisma.clientProject.create({
        data: { clientId: ids.client, name: `Peluquería Marta ${tag}` },
      })
    ).id;
    await prisma.managedSite.create({
      data: { projectId: ids.project, slug: `marta-${tag}`, preset: 'peluqueria', content: {} },
    });
    ids.bare = (
      await prisma.clientProject.create({ data: { clientId: ids.client, name: 'Sin web' } })
    ).id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.supportTicket.deleteMany({ where: { clientId: ids.client! } });
      await prisma.clientProject.deleteMany({ where: { clientId: ids.client! } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('sells the plan, follows Stripe, counts the changes and lets the team include it', async () => {
    const server = app.getHttpServer();
    const login = async (who: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(who).expect(200)).body.accessToken as string}`,
    });
    const adminAuth = await login(admin);
    const clientAuth = await login(client);
    const otherAuth = await login(other);
    const base = `/v1/portal/projects/${ids.project}/maintenance`;
    const send = (type: string, object: Record<string, unknown>, secret?: string) => {
      const event = signed(type, object, secret);
      return request(server)
        .post('/v1/payments/stripe')
        .set('content-type', 'application/json')
        .set('stripe-signature', event.signature)
        .send(event.payload);
    };
    const subscription = (status: string, cancel = false) =>
      ({
        id: `sub_${tag}`,
        object: 'subscription',
        status,
        customer: `cus_${tag}`,
        cancel_at_period_end: cancel,
        metadata: { kind: 'site-maintenance', projectId: ids.project },
        items: {
          data: [
            {
              current_period_end: 1_900_000_000,
              quantity: 1,
              price: { unit_amount: 1900, recurring: { interval: 'month', interval_count: 1 } },
            },
          ],
        },
      }) as unknown as StripeSubscription;

    // The landing's offer and the card before anything.
    const offer = await request(server).get('/v1/site-maintenance/offer').expect(200);
    expect(offer.body).toEqual({
      available: true,
      price: { amountCents: 1900, currency: 'eur', interval: 'month', vatPercent: 21 },
      allowance: 3,
    });
    const before = await request(server).get(base).set(clientAuth).expect(200);
    expect(before.body).toMatchObject({
      available: true,
      status: 'NONE',
      on: false,
      canManage: false,
      allowance: { limit: 3, used: 0 },
      invoices: [],
    });
    await request(server).get(base).set(otherAuth).expect(404);
    await request(server)
      .get(`/v1/portal/projects/${ids.bare}/maintenance`)
      .set(clientAuth)
      .expect(404);

    // Checkout: the client pays, not the admin; metadata names the plan and the project.
    await request(server).post(`${base}/checkout`).set(adminAuth).send({}).expect(403);
    await request(server).post(`${base}/portal`).set(clientAuth).send({}).expect(409);
    const checkout = await request(server)
      .post(`${base}/checkout`)
      .set(clientAuth)
      .send({ locale: 'es' })
      .expect(200);
    expect(checkout.body.url).toBe('https://checkout.stripe.com/maintenance');
    expect(checkouts[0]).toMatchObject({
      mode: 'subscription',
      customer: `cus_${tag}`,
      client_reference_id: ids.project,
      line_items: [{ price: 'price_maintenance', quantity: 1, tax_rates: ['txr_iva21'] }],
      metadata: { kind: 'site-maintenance', projectId: ids.project },
      subscription_data: { metadata: { kind: 'site-maintenance', projectId: ids.project } },
    });
    expect(checkouts[0]!.success_url).toContain(
      `/es/portal/projects/${ids.project}/site?maintenance=done`,
    );

    // A forged event changes nothing.
    await send(
      'checkout.session.completed',
      { object: 'checkout.session', mode: 'subscription', subscription: `sub_${tag}` },
      'whsec_forged',
    ).expect(400);

    // Paid: the webhook (signed) turns the plan on and tells the client and the team.
    subscriptions.set(`sub_${tag}`, subscription('active'));
    await send('checkout.session.completed', {
      object: 'checkout.session',
      id: `cs_${tag}`,
      mode: 'subscription',
      subscription: `sub_${tag}`,
      metadata: { kind: 'site-maintenance', projectId: ids.project },
    }).expect(200);
    await send('customer.subscription.created', {
      object: 'subscription',
      id: `sub_${tag}`,
      metadata: { kind: 'site-maintenance', projectId: ids.project },
    }).expect(200);
    const active = await request(server).get(base).set(clientAuth).expect(200);
    expect(active.body).toMatchObject({
      status: 'ACTIVE',
      on: true,
      canManage: true,
      periodEnd: new Date(1_900_000_000_000).toISOString(),
      invoices: [{ id: 'in_1', number: 'CQ-0001', url: 'https://invoice.stripe.com/i/1' }],
    });
    expect(sent.filter((m) => /plan de mantenimiento está activo/.test(m.subject))).toHaveLength(1);
    expect(sent.filter((m) => /A maintenance plan is active/.test(m.subject))).toHaveLength(1);
    await request(server).post(`${base}/checkout`).set(clientAuth).send({}).expect(409);
    const portal = await request(server).post(`${base}/portal`).set(clientAuth).send({});
    expect(portal.status).toBe(200);
    expect(portal.body.url).toBe('https://billing.stripe.com/maintenance');

    // The allowance: three included changes a month, then outside the plan; priority support.
    const open = (type: string, title: string, priority?: string) =>
      request(server)
        .post('/v1/portal/tickets')
        .set(clientAuth)
        .send({
          type,
          title,
          body: 'Cambiad el horario, por favor.',
          projectId: ids.project,
          priority,
        })
        .expect(201);
    const changes = [];
    for (const n of [1, 2, 3, 4]) changes.push((await open('CHANGE', `Cambio ${n}`)).body);
    expect(changes.map((ticket) => ticket.maintenanceIncluded)).toEqual([true, true, true, false]);
    expect(changes.every((ticket) => ticket.priority === 'HIGH')).toBe(true);
    const bug = (await open('BUG', 'No carga', 'URGENT')).body;
    expect(bug).toMatchObject({ maintenanceIncluded: null, priority: 'URGENT' });
    expect(sent.some((m) => m.subject.startsWith('[Plan] New support request'))).toBe(true);
    expect(
      (await request(server).get(base).set(clientAuth).expect(200)).body.allowance,
    ).toMatchObject({ limit: 3, used: 3 });

    // While the client pays, the team can't mark it included.
    await request(server)
      .put(`/v1/admin/projects/${ids.project}/maintenance/included`)
      .set(adminAuth)
      .send({ reason: 'Cliente fundador' })
      .expect(409);
    const list = await request(server).get('/v1/admin/maintenance').set(adminAuth).expect(200);
    expect(list.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ projectId: ids.project, status: 'ACTIVE' }),
      ]),
    );
    expect(list.body.mrrCents).toBe(list.body.paidCount * 1900);
    await request(server).get('/v1/admin/maintenance').set(clientAuth).expect(403);

    // A failed charge: emails, still on while Stripe retries.
    subscriptions.set(`sub_${tag}`, subscription('past_due'));
    await send('invoice.payment_failed', {
      object: 'invoice',
      id: 'in_2',
      customer: `cus_${tag}`,
      parent: {
        type: 'subscription_details',
        subscription_details: {
          subscription: `sub_${tag}`,
          metadata: { kind: 'site-maintenance', projectId: ids.project },
        },
      },
    }).expect(200);
    await send('customer.subscription.updated', {
      object: 'subscription',
      id: `sub_${tag}`,
      metadata: { kind: 'site-maintenance', projectId: ids.project },
    }).expect(200);
    expect(sent.some((m) => /No hemos podido cobrar/.test(m.subject))).toBe(true);
    const pastDue = await prisma.clientProject.findUniqueOrThrow({ where: { id: ids.project } });
    expect(pastDue.maintenanceStatus).toBe('PAST_DUE');
    // The month's bill before VAT is kept for the admin overview's MRR (decision 122).
    expect(pastDue.maintenanceAmountCents).toBe(1900);

    // Cancelled: ended, emails; changes are no longer counted.
    subscriptions.set(`sub_${tag}`, subscription('canceled'));
    await send('customer.subscription.deleted', {
      object: 'subscription',
      id: `sub_${tag}`,
      metadata: { kind: 'site-maintenance', projectId: ids.project },
    }).expect(200);
    const ended = await request(server).get(base).set(clientAuth).expect(200);
    expect(ended.body).toMatchObject({ status: 'CANCELED', on: false });
    expect(sent.some((m) => /plan de mantenimiento ha terminado/.test(m.subject))).toBe(true);
    expect((await open('CHANGE', 'Sin plan')).body).toMatchObject({
      maintenanceIncluded: null,
      priority: 'NORMAL',
    });

    // The team includes it for free, with a reason, and removes it.
    await request(server)
      .put(`/v1/admin/projects/${ids.project}/maintenance/included`)
      .set(adminAuth)
      .send({ reason: 'x' })
      .expect(400);
    const included = await request(server)
      .put(`/v1/admin/projects/${ids.project}/maintenance/included`)
      .set(adminAuth)
      .send({ reason: 'Incluido en el proyecto a medida' })
      .expect(200);
    expect(included.body).toMatchObject({
      included: true,
      on: true,
      includedReason: 'Incluido en el proyecto a medida',
      admin: { customerId: `cus_${tag}`, subscriptionId: `sub_${tag}` },
    });
    expect((await open('CHANGE', 'Con plan incluido')).body.maintenanceIncluded).toBe(false);
    await request(server).post(`${base}/checkout`).set(clientAuth).send({}).expect(409);
    await request(server)
      .put(`/v1/admin/projects/${ids.project}/maintenance/included`)
      .set(adminAuth)
      .send({ reason: null })
      .expect(200);
    const actions = await prisma.activityLog.findMany({
      where: { targetId: ids.project, action: { startsWith: 'project.maintenance_' } },
      select: { action: true },
    });
    expect(actions.map((a) => a.action).sort()).toEqual([
      'project.maintenance_changed',
      'project.maintenance_changed',
      'project.maintenance_changed',
      'project.maintenance_included',
      'project.maintenance_removed',
    ]);

    // Without the price the plan is hidden and can't be bought.
    const config = app.get(AppConfigService);
    const spy = vi.spyOn(config, 'maintenancePriceId', 'get').mockReturnValue(undefined);
    try {
      expect((await request(server).get('/v1/site-maintenance/offer').expect(200)).body).toEqual({
        available: false,
        price: null,
        allowance: 3,
      });
      expect((await request(server).get(base).set(clientAuth).expect(200)).body.available).toBe(
        false,
      );
      await request(server).post(`${base}/checkout`).set(clientAuth).send({}).expect(404);
    } finally {
      spy.mockRestore();
    }
  });
});
