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
import { MailService, type MailMessage } from '../src/modules/mail/mail.service.js';
import { SiteBuilderClient } from '../src/modules/managed-sites/site-builder.client.js';
import { SitePurchasesService } from '../src/modules/managed-sites/site-purchases.service.js';
import { StripeClient, type CheckoutParams } from '../src/modules/managed-sites/stripe.client.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Buying online is on with test keys; nothing reaches Stripe (Checkout is faked, events signed here).
const WEBHOOK_SECRET = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_e2e';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_e2e_secret';
  return 'whsec_e2e_secret';
});

const tag = randomUUID().slice(0, 8);
const password = 'purchase-password-1';
const admin = { email: `e2e-buy-admin-${tag}@codeqlick.test`, password };
const buyer = `e2e-buy-marta-${tag}@codeqlick.test`;
const slug = `alba-${tag}-x1y2z3`;

/** A preset as site-builder returns it. */
const preset = {
  demo: true,
  url: 'https://peluqueria.demo.codeqlick.com',
  form: { demo: true },
  business: { name: 'Alba Estudio', description: 'Peluquería en Triana.', schemaType: 'HairSalon' },
  theme: {
    primary: '#A84A33',
    primaryText: '#FFFFFF',
    background: '#FBF7F4',
    surface: '#F4ECE6',
    text: '#2A1F1C',
    muted: '#6B5A54',
    headingFont: 'playfair',
    bodyFont: 'inter',
    corners: 'round',
  },
  contact: { phone: '954 00 00 00' },
  hero: {
    title: 'Tu pelo, en las mejores manos',
    text: 'Cortes, color y peinados.',
    image: { file: 'hero.jpg', alt: 'Peluquera' },
    primary: { label: 'Pedir cita', href: '#contacto' },
  },
  contactSection: { title: 'Pide tu cita' },
  legal: { owner: 'Alba', taxId: '0', address: 'Sevilla', email: 'hola@alba.example' },
};

const signer = new Stripe('sk_test_e2e');

/** A Stripe event about a Checkout Session, as the webhook receives it. */
function event(type: string, session: Record<string, unknown>) {
  const payload = JSON.stringify({
    id: `evt_${randomUUID().replaceAll('-', '')}`,
    object: 'event',
    type,
    data: { object: { object: 'checkout.session', ...session } },
  });
  const signature = signer.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  return { payload, signature };
}

describe('Buying a preview online (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let leadId: string;
  const sent: MailMessage[] = [];
  const checkouts: CheckoutParams[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({
      bufferLogs: true,
      rawBody: true,
    });
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    const builder = app.get(SiteBuilderClient);
    vi.spyOn(builder, 'presets').mockResolvedValue([{ key: 'peluqueria', content: preset }]);
    vi.spyOn(builder, 'build').mockResolvedValue({ ok: true, release: 'r1', ms: 10 });
    vi.spyOn(builder, 'remove').mockResolvedValue(undefined);
    vi.spyOn(app.get(StripeClient), 'taxRate').mockResolvedValue('txr_iva21');
    let n = 0;
    vi.spyOn(app.get(StripeClient), 'createCheckout').mockImplementation((params) => {
      checkouts.push(params);
      n += 1;
      return Promise.resolve({
        id: `cs_test_${tag}_${n}`,
        url: `https://checkout.stripe.com/${n}`,
      });
    });
    vi.spyOn(app.get(MailService), 'send').mockImplementation((message: MailMessage) => {
      sent.push(message);
      return Promise.resolve();
    });
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.create({
      data: { email: admin.email, name: 'Luis', role: Role.ADMIN, passwordHash },
    });
    leadId = (
      await prisma.lead.create({
        data: {
          name: 'Marta',
          email: buyer,
          company: 'Alba Estudio',
          message: 'Web',
          locale: 'ES',
          siteRequest: {
            preset: 'peluqueria',
            business: { name: `Alba Estudio ${tag}`, kind: 'Peluquería', city: 'Sevilla' },
          },
          previewSlug: slug,
          previewStatus: 'READY',
          previewBuiltAt: new Date(),
        },
      })
    ).id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.sitePurchase.deleteMany({ where: { leadId } });
      const clients = await prisma.user.findMany({
        where: { email: { contains: `-${tag}@` }, role: Role.CLIENT },
        select: { id: true },
      });
      await prisma.clientProject.deleteMany({
        where: { clientId: { in: clients.map((c) => c.id) } },
      });
      await prisma.lead.deleteMany({ where: { id: leadId } });
      await prisma.user.deleteMany({ where: { email: { contains: `-${tag}@` } } });
    }
    await app?.close();
  });

  it('offers the website, takes the payment through Checkout and makes it once paid', async () => {
    const server = app.getHttpServer();
    const offer = await request(server).get(`/v1/site-requests/previews/${slug}`).expect(200);
    expect(offer.body).toMatchObject({
      status: 'READY',
      business: 'Alba Estudio',
      purchase: {
        priceCents: 20000,
        vatPercent: 21,
        totalCents: 24200,
        currency: 'eur',
        available: true,
      },
    });

    // The terms must be accepted.
    await request(server)
      .post(`/v1/site-requests/previews/${slug}/checkout`)
      .send({ locale: 'es' })
      .expect(400);
    const checkout = await request(server)
      .post(`/v1/site-requests/previews/${slug}/checkout`)
      .send({ locale: 'es', accept: true })
      .expect(200);
    expect(checkout.body).toEqual({ url: 'https://checkout.stripe.com/1' });
    expect(checkouts[0]).toMatchObject({
      mode: 'payment',
      customer_email: buyer,
      line_items: [
        {
          price_data: { currency: 'eur', unit_amount: 20000 },
          quantity: 1,
          tax_rates: ['txr_iva21'],
        },
      ],
      invoice_creation: { enabled: true },
      success_url: expect.stringContaining(
        `/es/basic-website/request/preview/${slug}/paid?session={CHECKOUT_SESSION_ID}`,
      ),
    });
    const session = `cs_test_${tag}_1`;
    await request(server).get(`/v1/site-requests/purchases/${session}`).expect(200, {
      status: 'PENDING',
      business: 'Alba Estudio',
      siteUrl: null,
      delayed: false,
    });

    // Unsigned or tampered events are refused.
    const paid = event('checkout.session.completed', {
      id: session,
      payment_status: 'paid',
      amount_total: 24200,
      invoice: 'in_test_e2e',
      customer_details: { email: buyer },
    });
    await request(server)
      .post('/v1/payments/stripe')
      .set('content-type', 'application/json')
      .set('stripe-signature', 't=1,v1=nope')
      .send(paid.payload)
      .expect(400);

    // Paid: the website is made from the request, once even if Stripe sends it again.
    for (let i = 0; i < 2; i++) {
      await request(server)
        .post('/v1/payments/stripe')
        .set('content-type', 'application/json')
        .set('stripe-signature', paid.signature)
        .send(paid.payload)
        .expect(200, { received: true });
      await app.get(SitePurchasesService).pending;
    }
    const purchase = await prisma.sitePurchase.findUniqueOrThrow({
      where: { stripeSessionId: session },
      include: { project: { include: { site: true } }, lead: true },
    });
    expect(purchase).toMatchObject({
      status: 'PAID',
      email: buyer,
      amountCents: 24200,
      stripeInvoiceId: 'in_test_e2e',
      error: null,
    });
    expect(purchase.lead).toMatchObject({ status: 'WON', previewStatus: 'REMOVED' });
    expect(purchase.project?.site?.slug).toBe(`alba-estudio-${tag}`);
    expect(await prisma.clientProject.count({ where: { clientId: purchase.lead.clientId! } })).toBe(
      1,
    );
    expect(sent.some((m) => m.to === buyer && m.subject.includes('ya es tuya'))).toBe(true);
    expect(sent.filter((m) => m.subject.startsWith('[codeqlick] Website bought'))).toHaveLength(1);

    const progress = await request(server)
      .get(`/v1/site-requests/purchases/${session}`)
      .expect(200);
    expect(progress.body).toMatchObject({
      status: 'PAID',
      siteUrl: expect.stringContaining('alba-estudio'),
    });

    // Bought: not for sale again, and the lead keeps its record.
    await request(server)
      .post(`/v1/site-requests/previews/${slug}/checkout`)
      .send({ locale: 'es', accept: true })
      .expect(409);
    const login = await request(server).post('/v1/auth/login').send(admin).expect(200);
    const auth = { Authorization: `Bearer ${login.body.accessToken as string}` };
    await request(server).delete(`/v1/admin/leads/${leadId}`).set(auth).expect(409);
    const list = await request(server)
      .get(`/v1/admin/leads/${leadId}/purchases`)
      .set(auth)
      .expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        status: 'PAID',
        amountCents: 24200,
        stripeInvoiceId: 'in_test_e2e',
        projectId: purchase.projectId,
      }),
    ]);
  });

  it('marks an abandoned Checkout as expired', async () => {
    await prisma.sitePurchase.create({
      data: { leadId, stripeSessionId: `cs_test_${tag}_old`, amountCents: 20000, currency: 'eur' },
    });
    const expired = event('checkout.session.expired', { id: `cs_test_${tag}_old` });
    await request(app.getHttpServer())
      .post('/v1/payments/stripe')
      .set('content-type', 'application/json')
      .set('stripe-signature', expired.signature)
      .send(expired.payload)
      .expect(200);
    const row = await prisma.sitePurchase.findUniqueOrThrow({
      where: { stripeSessionId: `cs_test_${tag}_old` },
    });
    expect(row.status).toBe('EXPIRED');
  });
});
