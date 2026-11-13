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
import { Role } from '../src/generated/prisma/client.js';
import { CLOUD_TERMS_VERSION } from '../src/modules/cloud/cloud-plans.js';
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import {
  StripeClient,
  type CheckoutParams,
  type StripeSubscription,
} from '../src/modules/managed-sites/stripe.client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const WEBHOOK_SECRET = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_e2e';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_e2e_billing';
  process.env.STRIPE_CLOUD_PRO_PRICE_ID = 'price_cloud_pro';
  return 'whsec_e2e_billing';
});

const signer = new Stripe('sk_test_e2e');
const tag = randomUUID().slice(0, 8);
const password = 'cloud-billing-password-1';
const owner = { email: `e2e-cb-owner-${tag}@codeqlick.test`, password };
const member = { email: `e2e-cb-member-${tag}@codeqlick.test`, password };
const terms = { acceptTerms: true, termsVersion: CLOUD_TERMS_VERSION };

function signed(type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({
    id: `evt_${randomUUID().replaceAll('-', '')}`,
    object: 'event',
    type,
    data: { object },
  });
  return {
    payload,
    signature: signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET }),
  };
}

describe('Codeqlick Cloud PRO plan (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const sent: MailMessage[] = [];
  const checkouts: CheckoutParams[] = [];
  /** What Stripe says each subscription is now. */
  const subscriptions = new Map<string, StripeSubscription>();

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
      return Promise.resolve({ id: `cs_${tag}`, url: 'https://checkout.stripe.com/pro' });
    });
    vi.spyOn(stripe, 'portal').mockResolvedValue('https://billing.stripe.com/portal');
    vi.spyOn(stripe, 'subscription').mockImplementation((id) =>
      Promise.resolve(subscriptions.get(id)!),
    );
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message) => {
      sent.push(message);
      return Promise.resolve();
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    for (const person of [owner, member]) {
      await prisma.user.create({
        data: {
          email: person.email,
          name: 'Ada',
          role: Role.CLIENT,
          passwordHash,
          registeredAt: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.cloudTeam.deleteMany({ where: { slug: `b-${tag}` } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('upgrades through Checkout, follows the subscription and goes back to free', async () => {
    const server = app.getHttpServer();
    const login = async (who: { email: string; password: string }) => ({
      Authorization: `Bearer ${(await request(server).post('/v1/auth/login').send(who).expect(200)).body.accessToken as string}`,
    });
    const auth = await login(owner);
    await request(server)
      .post('/v1/cloud/teams')
      .set(auth)
      .send({ name: 'Billing', slug: `b-${tag}`, ...terms })
      .expect(201);
    const team = await prisma.cloudTeam.findUniqueOrThrow({ where: { slug: `b-${tag}` } });
    const base = `/v1/cloud/teams/b-${tag}/billing`;

    const before = await request(server).get(base).set(auth).expect(200);
    expect(before.body).toMatchObject({
      available: true,
      plan: 'FREE',
      price: { amount: 1900, currency: 'eur', interval: 'month', vatPercent: 21 },
      subscription: null,
    });
    expect(before.body.limits.PRO.projectsPerTeam).toBe(50);

    // Members can't pay; the owner gets Stripe's page.
    const memberRow = await prisma.user.findUniqueOrThrow({ where: { email: member.email } });
    await prisma.cloudMember.create({
      data: {
        teamId: team.id,
        userId: memberRow.id,
        role: 'ADMIN',
        termsVersion: CLOUD_TERMS_VERSION,
        termsAcceptedAt: new Date(),
      },
    });
    const memberAuth = await login(member);
    await request(server)
      .post(`${base}/checkout`)
      .set(memberAuth)
      .send({ locale: 'es' })
      .expect(403);
    await request(server).post(`${base}/portal`).set(auth).send({}).expect(409);
    const checkout = await request(server)
      .post(`${base}/checkout`)
      .set(auth)
      .send({ locale: 'es' })
      .expect(200);
    expect(checkout.body.url).toBe('https://checkout.stripe.com/pro');
    expect(checkouts[0]).toMatchObject({
      mode: 'subscription',
      customer: `cus_${tag}`,
      client_reference_id: team.id,
      line_items: [{ price: 'price_cloud_pro', quantity: 1, tax_rates: ['txr_iva21'] }],
      subscription_data: { metadata: { kind: 'cloud-pro', cloudTeamId: team.id } },
    });
    expect(checkouts[0]!.success_url).toContain(`/es/console/b-${tag}/plan?billing=done`);

    const send = (type: string, object: Record<string, unknown>) => {
      const event = signed(type, object);
      return request(server)
        .post('/v1/payments/stripe')
        .set('content-type', 'application/json')
        .set('stripe-signature', event.signature)
        .send(event.payload)
        .expect(200);
    };
    const subscription = (status: string, cancel = false) =>
      ({
        id: `sub_${tag}`,
        object: 'subscription',
        status,
        customer: `cus_${tag}`,
        cancel_at_period_end: cancel,
        metadata: { kind: 'cloud-pro', cloudTeamId: team.id },
        items: { data: [{ current_period_end: 1_900_000_000 }] },
      }) as unknown as StripeSubscription;

    // Paid: PRO, the owners are told once.
    subscriptions.set(`sub_${tag}`, subscription('active'));
    await send('checkout.session.completed', {
      object: 'checkout.session',
      id: `cs_${tag}`,
      mode: 'subscription',
      subscription: `sub_${tag}`,
      metadata: { kind: 'cloud-pro', cloudTeamId: team.id },
    });
    await send('customer.subscription.created', { object: 'subscription', id: `sub_${tag}` });
    const pro = await request(server).get(base).set(auth).expect(200);
    expect(pro.body).toMatchObject({
      plan: 'PRO',
      subscription: {
        status: 'active',
        currentPeriodEnd: new Date(1_900_000_000_000).toISOString(),
        cancelAtPeriodEnd: false,
      },
    });
    expect(sent.filter((m) => m.subject.includes('PRO'))).toHaveLength(1);
    await request(server).post(`${base}/checkout`).set(auth).send({}).expect(409);
    const portal = await request(server).post(`${base}/portal`).set(auth).send({}).expect(200);
    expect(portal.body.url).toBe('https://billing.stripe.com/portal');

    // A failed charge warns the owners and keeps PRO while Stripe retries.
    subscriptions.set(`sub_${tag}`, subscription('past_due'));
    await send('invoice.payment_failed', { object: 'invoice', id: 'in_1', customer: `cus_${tag}` });
    await send('customer.subscription.updated', { object: 'subscription', id: `sub_${tag}` });
    expect((await prisma.cloudTeam.findUniqueOrThrow({ where: { id: team.id } })).plan).toBe('PRO');
    expect(sent.some((m) => /couldn't charge/.test(m.subject))).toBe(true);

    // Canceled: back to FREE, nothing deleted.
    subscriptions.set(`sub_${tag}`, subscription('canceled'));
    await send('customer.subscription.deleted', { object: 'subscription', id: `sub_${tag}` });
    const free = await prisma.cloudTeam.findUniqueOrThrow({ where: { id: team.id } });
    expect(free).toMatchObject({ plan: 'FREE', subscriptionStatus: 'canceled' });
    expect(sent.some((m) => /back on the free plan/.test(m.subject))).toBe(true);
    const events = await prisma.cloudEvent.findMany({
      where: { teamId: team.id, action: 'plan.changed' },
    });
    expect(events).toHaveLength(2);
  });
});
