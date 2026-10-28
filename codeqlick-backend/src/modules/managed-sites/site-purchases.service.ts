import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { toLabel } from '../domains/availability.js';
import { LeadsService } from '../leads/leads.service.js';
import { renderEmail } from '../mail/email-layout.js';
import { MailService } from '../mail/mail.service.js';
import { onboardSiteSchema } from './managed-sites.schemas.js';
import { SiteOnboardingService } from './site-onboarding.service.js';
import { previewSlugOf, priceLabel } from './site-previews.service.js';
import { SitePurchasesRepository } from './site-purchases.repository.js';
import { storedRequestSchema } from './site-request.js';
import { StripeClient, type CheckoutSession, type StripeEvent } from './stripe.client.js';

export type PurchaseStatus = 'PENDING' | 'PAID' | 'EXPIRED';

/** What the preview's pages show about buying it; null while buying online is off. */
export interface PurchaseOffer {
  /** Before VAT. */
  priceCents: number;
  vatPercent: number;
  /** What is charged, VAT included. */
  totalCents: number;
  currency: 'eur';
  /** The preview is READY, not bought and its lead isn't a client yet. */
  available: boolean;
}

/** A purchase as the page Stripe returns to follows it. */
export interface PurchaseProgress {
  status: PurchaseStatus;
  business: string | null;
  /** Once its site exists. */
  siteUrl: string | null;
  /** Paid, but its site couldn't be made on its own: the team is finishing it. */
  delayed: boolean;
}

/** A purchase on the lead page. */
export interface PurchaseView extends PurchaseProgress {
  id: string;
  stripeSessionId: string;
  amountCents: number;
  currency: string;
  email: string | null;
  paidAt: string | null;
  projectId: string | null;
  stripeInvoiceId: string | null;
  error: string | null;
  createdAt: string;
}

/**
 * Buying a preview online (architecture 8.2, decision 20): a Stripe Checkout Session for the
 * website's price, and, once Stripe's webhook says it is paid, the whole website made from the
 * request as onboarding would, with nobody from the team in between.
 */
@Injectable()
export class SitePurchasesService {
  private readonly logger = new Logger(SitePurchasesService.name);

  constructor(
    private readonly repository: SitePurchasesRepository,
    private readonly stripe: StripeClient,
    private readonly onboarding: SiteOnboardingService,
    private readonly leads: LeadsService,
    private readonly activity: ActivityService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  get enabled(): boolean {
    return this.stripe.enabled;
  }

  /** For `GET /site-requests/previews/:slug`. */
  async offer(slug: string): Promise<PurchaseOffer | null> {
    if (!this.enabled) return null;
    const lead = await this.repository.leadBySlug(slug);
    return {
      priceCents: this.config.sitePriceCents,
      vatPercent: this.config.siteVatPercent,
      totalCents: this.config.siteTotalCents,
      currency: 'eur',
      available:
        lead?.previewStatus === 'READY' && lead.clientId === null && lead.purchases.length === 0,
    };
  }

  /** The Checkout Session to pay the preview's website; its address, for the buyer to go to. */
  async checkout(slug: string, locale: ApiLocale): Promise<{ url: string }> {
    if (!this.enabled) throw new NotFoundException('Buying online is not available');
    const lead = await this.repository.leadBySlug(slug);
    if (!lead?.previewStatus) throw new NotFoundException('Preview not found');
    if (lead.clientId || lead.purchases.length > 0) {
      throw new ConflictException('This website has already been bought');
    }
    if (lead.previewStatus !== 'READY') throw new ConflictException('The preview is not ready');
    const request = storedRequestSchema.parse(lead.siteRequest);
    const es = locale === 'es';
    const business = request.business.name;
    const id = randomUUID();
    const vat = this.config.siteVatPercent;
    const taxRates = vat > 0 ? [await this.stripe.taxRate(vat)] : [];
    const product = `${es ? 'Web básica' : 'Basic website'} — ${business}`;
    const back = `${this.config.siteUrl}/${locale}/basic-website/request/preview/${slug}`;
    const session = await this.stripe.createCheckout({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: this.config.sitePriceCents,
            product_data: { name: product },
          },
          ...(taxRates.length > 0 ? { tax_rates: taxRates } : {}),
        },
      ],
      // Stripe numbers, emails and keeps the invoice of each sale (decision 20).
      invoice_creation: {
        enabled: true,
        invoice_data: { description: product, metadata: { purchaseId: id, leadId: lead.id } },
      },
      ...(lead.email ? { customer_email: lead.email } : {}),
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      locale: es ? 'es' : 'en',
      client_reference_id: id,
      metadata: { purchaseId: id, leadId: lead.id, slug },
      success_url: `${back}/paid?session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${back}/buy?cancelled=1`,
    });
    await this.repository.create({
      id,
      leadId: lead.id,
      stripeSessionId: session.id,
      amountCents: this.config.siteTotalCents,
      currency: 'eur',
    });
    return { url: session.url };
  }

  /** For the page Stripe returns to; null when the session is unknown. */
  async progress(sessionId: string): Promise<PurchaseProgress | null> {
    const row = await this.repository.findBySession(sessionId);
    return row ? this.toProgress(row) : null;
  }

  /** A lead's purchases (the lead page). */
  async forLead(leadId: string): Promise<PurchaseView[]> {
    return (await this.repository.forLead(leadId)).map((row) => ({
      ...this.toProgress(row),
      id: row.id,
      stripeSessionId: row.stripeSessionId,
      amountCents: row.amountCents,
      currency: row.currency,
      email: row.email,
      paidAt: row.paidAt?.toISOString() ?? null,
      projectId: row.projectId,
      stripeInvoiceId: row.stripeInvoiceId,
      error: row.error,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  /** The webhook's event, signature checked (throws when it doesn't match). */
  verify(payload: Buffer, signature: string): StripeEvent {
    return this.stripe.event(payload, signature);
  }

  /**
   * Stripe's webhook: a paid session marks its purchase PAID and makes the website in the
   * background (the answer can't wait for a build); an expired one marks it EXPIRED.
   */
  async handle(event: StripeEvent, now = new Date()): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object;
        if (session.payment_status !== 'paid') return;
        await this.paid(session, now);
        return;
      }
      case 'checkout.session.expired':
        await this.repository.markExpired(event.data.object.id);
        return;
      default:
        return;
    }
  }

  /** The background work after a payment, for tests to wait on. */
  pending: Promise<void> = Promise.resolve();

  private async paid(session: CheckoutSession, now: Date): Promise<void> {
    const email = session.customer_details?.email ?? session.customer_email ?? null;
    const paid = {
      email,
      amountCents: session.amount_total ?? null,
      invoiceId:
        typeof session.invoice === 'string' ? session.invoice : (session.invoice?.id ?? null),
    };
    if (!(await this.repository.markPaid(session.id, paid, now))) return;
    const purchase = await this.repository.findBySession(session.id);
    if (!purchase) {
      this.logger.error(`Paid Checkout Session ${session.id} has no purchase`);
      return;
    }
    this.notifyTeam(purchase.leadId, purchase.lead.company, purchase.amountCents, email);
    this.pending = this.makeSite(purchase.id, purchase.leadId, purchase.email ?? email).catch(
      async (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`The website of purchase ${purchase.id} wasn't made: ${message}`);
        await this.repository.update(purchase.id, { error: message.slice(0, 1000) });
        this.notifyTeam(
          purchase.leadId,
          purchase.lead.company,
          purchase.amountCents,
          email,
          message,
        );
      },
    );
  }

  /** The bought website, as onboarding from the lead makes it (architecture 8.2). */
  private async makeSite(purchaseId: string, leadId: string, email: string | null): Promise<void> {
    const admin = await this.repository.teamAdmin();
    if (!admin) throw new Error('There is no active admin to make it as');
    const actor: AuthUser = { ...admin, role: 'ADMIN' };
    let lead = await this.leads.get(leadId);
    if (lead.clientId) throw new Error('The lead was already a client');
    if (!lead.email) {
      if (!email) throw new Error('Neither the lead nor Stripe have the buyer’s email');
      lead = await this.leads.update(actor, leadId, { email });
    }
    const request = storedRequestSchema.parse(lead.siteRequest);
    const result = await this.onboarding.onboard(
      actor,
      onboardSiteSchema.parse({
        name: lead.name,
        email: lead.email,
        locale: lead.locale,
        businessName: request.business.name,
        slug: await this.freeSlug(request.business.name),
        preset: request.preset,
        domain: null,
        leadId,
      }),
    );
    await this.repository.update(purchaseId, { projectId: result.projectId, error: null });
    if (result.site.status === 'FAILED') {
      throw new Error(
        `The site was made but its first build failed: ${result.site.lastBuildError}`,
      );
    }
    await this.activity.record(actor, {
      action: 'lead.purchased',
      targetId: leadId,
      targetLabel: lead.name,
      details: { business: request.business.name, amount: priceLabel(this.config.siteTotalCents) },
    });
    const siteUrl = result.site.url;
    await this.mail
      .send(
        boughtEmail(
          { name: lead.name, email: lead.email!, locale: lead.locale },
          request.business.name,
          siteUrl,
          `${this.config.siteUrl}/${lead.locale}/portal/projects/${result.projectId}/site`,
          result.client.registered,
          this.config.siteUrl,
        ),
      )
      .catch((error: unknown) => this.logger.error('The purchase email failed', error));
  }

  /** The business's label as the site's name, with a number when another site has it. */
  private async freeSlug(business: string): Promise<string> {
    const label = toLabel(business).slice(0, 36).replace(/-+$/, '') || 'web';
    const candidates = [label, ...[2, 3, 4, 5].map((n) => `${label}-${n}`)];
    for (const slug of candidates) {
      const valid = onboardSiteSchema.shape.slug.safeParse(slug).success;
      if (valid && !(await this.repository.slugTaken(slug))) return slug;
    }
    return previewSlugOf(business);
  }

  private toProgress(row: {
    status: PurchaseStatus;
    error: string | null;
    lead: { company: string | null };
    project: { site: { slug: string; domain: string | null } | null } | null;
  }): PurchaseProgress {
    const site = row.project?.site;
    return {
      status: row.status,
      business: row.lead.company,
      siteUrl:
        site && row.error === null
          ? `https://${site.domain ?? `${site.slug}.${this.config.sitesPreviewDomain}`}`
          : null,
      delayed: row.error !== null,
    };
  }

  /** To the team: a website was bought, or (with `error`) it couldn't be made on its own. */
  private notifyTeam(
    leadId: string,
    business: string | null,
    amountCents: number,
    email: string | null,
    error?: string,
  ): void {
    const name = business ?? leadId;
    void this.mail
      .send({
        to: this.config.leadsNotifyTo,
        subject: error
          ? `[codeqlick] Purchase needs you: ${name}`
          : `[codeqlick] Website bought: ${name}`,
        ...renderEmail(
          {
            locale: 'en',
            preheader: `${priceLabel(amountCents)} · ${name}`,
            title: error ? 'A bought website could not be made' : 'A website was bought',
            intro: [
              error
                ? 'The payment went through, but the website could not be made on its own. Finish it from the lead (onboarding) or refund it from Stripe.'
                : 'The payment went through on Stripe; the website is being made from the request, and the buyer gets an email to enter the client area.',
            ],
            details: [
              ['Business', name],
              ['Amount', priceLabel(amountCents)],
              ['Buyer', email ?? '—'],
              ...(error ? ([['Error', error]] as Array<[string, string]>) : []),
            ],
            button: {
              label: 'Open the lead',
              url: `${this.config.siteUrl}/es/admin/leads/${leadId}`,
            },
            signoff: [],
          },
          this.config.siteUrl,
        ),
      })
      .catch((failure: unknown) => this.logger.error('Could not email the purchase', failure));
  }
}

/** To the buyer: paid, and the website is made; the client area is where they finish it. */
function boughtEmail(
  person: { name: string; email: string; locale: ApiLocale },
  business: string,
  siteUrl: string,
  portalUrl: string,
  registered: boolean,
  appUrl: string,
) {
  const { locale } = person;
  const es = locale === 'es';
  return {
    to: person.email,
    subject: es ? `La web de ${business} ya es tuya` : `${business}'s website is yours`,
    ...renderEmail(
      {
        locale,
        preheader: siteUrl,
        title: es
          ? 'Pago recibido: tu web ya está creada'
          : 'Payment received: your website is made',
        greeting: es ? `Hola ${person.name}:` : `Hi ${person.name},`,
        intro: es
          ? [
              `Gracias por tu compra. La web de ${business} ya está creada y publicada en ${siteUrl}, con su formulario de contacto funcionando.`,
              registered
                ? 'Entra en tu área de cliente para cambiar lo que quieras (textos, fotos, colores y secciones) y elegir tu dominio.'
                : 'Te hemos enviado otro email para crear tu cuenta. Desde tu área de cliente cambias lo que quieras (textos, fotos, colores y secciones) y eliges tu dominio.',
            ]
          : [
              `Thanks for your purchase. ${business}'s website is made and online at ${siteUrl}, with its contact form working.`,
              registered
                ? 'Open your client area to change anything you like (texts, photos, colours and sections) and choose your domain.'
                : 'We sent you another email to create your account. From your client area you change anything you like (texts, photos, colours and sections) and choose your domain.',
            ],
        button: { label: es ? 'Editar mi web' : 'Edit my website', url: portalUrl },
        note: es
          ? 'Stripe te envía por email la factura del pago. Si tienes cualquier duda, responde a este correo.'
          : 'Stripe emails you the invoice. Any question? Just reply to this email.',
      },
      appUrl,
    ),
  };
}
