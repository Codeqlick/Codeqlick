import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { toApiLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { toLabel } from '../domains/availability.js';
import { renderEmail } from '../mail/email-layout.js';
import { MailService } from '../mail/mail.service.js';
import { madridToday } from '../proposals/proposals.service.js';
import { siteContentSchema } from './managed-sites.schemas.js';
import { SiteBuilderClient } from './site-builder.client.js';
import { SitePreviewsRepository } from './site-previews.repository.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { LeadsService, type Lead } from '../leads/leads.service.js';
import {
  contentFromRequest,
  requestSummary,
  storedRequestSchema,
  type ProspectInput,
  type SiteRequest,
} from './site-request.js';

const DAY_MS = 86_400_000;
/** Previews a day across all requests: Let's Encrypt allows 50 certificates a week per domain. */
export const DAILY_PREVIEWS = 10;
const KEEP_DAYS = 30;
/** Days after a preview is ready before its requester is asked what they think of it. */
export const FOLLOW_UP_DAYS = 3;
/** How long the host may take to publish a built preview over HTTPS (sync-sites runs each minute). */
const LIVE_WAIT_MS = 10 * 60_000;
const LIVE_POLL_MS = 10_000;

export type PreviewStatus = 'BUILDING' | 'READY' | 'FAILED' | 'REMOVED';

/** A row of Admin → Vistas previas. */
export interface PreviewListItem {
  leadId: string;
  name: string;
  email: string | null;
  business: string | null;
  preset: string | null;
  slug: string;
  url: string;
  status: PreviewStatus | null;
  builtAt: string | null;
  createdAt: string;
  prospect: boolean;
  /** Bought online (decision 20). */
  purchased: boolean;
}

const LIST_LIMIT = 200;
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** `<business label>-<6 random chars>`, at most 40 characters (the builder's slug rule). */
export function previewSlugOf(businessName: string, random = randomBytes(6)): string {
  const label = toLabel(businessName).slice(0, 33).replace(/-+$/, '') || 'web';
  const suffix = [...random].map((byte) => ALPHABET[byte % ALPHABET.length]).join('');
  return `${label}-${suffix}`;
}

/**
 * Instant previews of website requests (architecture 8.2, decision 16): built from the request in
 * demo mode, noindex, at `<slug>.<SITES_PREVIEW_DOMAIN>`; taken down after 30 days, or once the
 * lead is converted or marked as spam (a job every 6 hours, off in tests), which also sends the
 * follow-ups due.
 */
@Injectable()
export class SitePreviewsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SitePreviewsService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly repository: SitePreviewsRepository,
    private readonly builder: SiteBuilderClient,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly leads: LeadsService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.nodeEnv === 'test') return;
    const run = () => void this.removeDue().then(() => this.sendFollowUps());
    this.timer = setInterval(run, DAY_MS / 4);
    this.timer.unref();
    setTimeout(run, 180_000).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  urlOf(slug: string): string {
    return `https://${slug}.${this.config.sitesPreviewDomain}`;
  }

  /**
   * The page on the website that waits for the preview to be online and then opens it: the link to
   * share before it is READY (its own address answers with another site of the server until then).
   */
  waitingUrlOf(slug: string, locale: ApiLocale): string {
    return `${this.config.siteUrl}/${locale}/basic-website/request/preview/${slug}`;
  }

  /** Where to buy the preview's website, while buying online is on (architecture 8.2). */
  buyLinkOf(slug: string, locale: ApiLocale): BuyLink | undefined {
    if (!this.config.stripe) return undefined;
    return {
      url: `${this.config.siteUrl}/${locale}/basic-website/request/preview/${slug}/buy`,
      price: priceLabel(this.config.sitePriceCents),
      vat: this.config.siteVatPercent,
    };
  }

  /** A free slug for a new preview, or null without a builder or past today's cap. */
  async reserve(businessName: string, now = new Date()): Promise<string | null> {
    if (!this.config.siteBuilder) return null;
    if ((await this.repository.countSince(new Date(now.getTime() - DAY_MS))) >= DAILY_PREVIEWS) {
      this.logger.warn('Daily preview cap reached: request kept without preview');
      return null;
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = previewSlugOf(businessName);
      if (!(await this.repository.slugTaken(slug))) return slug;
    }
    return null;
  }

  /**
   * Builds the lead's preview in the background; the requester is emailed when it is ready unless
   * `notify` is false (a prospect, or a rebuild by the team).
   */
  start(
    leadId: string,
    slug: string,
    request: SiteRequest,
    person: { name: string; email: string | null; locale: ApiLocale },
    notify = true,
  ): void {
    void this.build(leadId, slug, request, person, notify).catch(async (error: unknown) => {
      this.logger.error(`Preview ${slug} failed: ${String(error)}`);
      await this.repository.update(leadId, { previewStatus: 'FAILED' }).catch(() => undefined);
    });
  }

  /** Every preview, newest first (Admin → Vistas previas). */
  async list(): Promise<PreviewListItem[]> {
    return (await this.repository.list(LIST_LIMIT)).map((row) => {
      const request = storedRequestSchema.safeParse(row.siteRequest);
      return {
        leadId: row.id,
        name: row.name,
        email: row.email,
        business: request.success ? request.data.business.name : null,
        preset: request.success ? request.data.preset : null,
        slug: row.previewSlug!,
        url: this.urlOf(row.previewSlug!),
        status: (row.previewStatus as PreviewStatus | null) ?? null,
        builtAt: row.previewBuiltAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        prospect: row.createdById !== null,
        purchased: row.purchases.length > 0,
      };
    });
  }

  /**
   * A prospect (architecture 8.2): a lead the team adds for a business that hasn't asked yet, with
   * its preview building. Nobody is emailed.
   */
  async createProspect(actor: AuthUser, input: ProspectInput): Promise<{ leadId: string }> {
    const slug = await this.reserveOrThrow(input.business.name);
    const request: SiteRequest = {
      preset: input.preset,
      business: input.business,
      domain: input.domain,
    };
    const name = input.name ?? input.business.name;
    const { id } = await this.leads.createProspect(actor, {
      name,
      email: input.email ?? null,
      company: input.business.name,
      message: requestSummary(request).slice(0, 5000),
      locale: input.locale,
      siteRequest: request as Prisma.InputJsonValue,
      previewSlug: slug,
    });
    this.start(
      id,
      slug,
      request,
      { name, email: input.email ?? null, locale: input.locale },
      false,
    );
    return { leadId: id };
  }

  /** Replaces the lead's website request and rebuilds its preview from it. */
  async editRequest(leadId: string, request: SiteRequest): Promise<Lead> {
    await this.leads.replaceRequest(
      leadId,
      request as Prisma.InputJsonValue,
      requestSummary(request).slice(0, 5000),
    );
    await this.rebuild(leadId);
    return this.leads.get(leadId);
  }

  /**
   * (Re)builds the lead's preview from its request, without emailing anyone: on its slug while it
   * is up, on a new one (counting toward the daily cap) when it was removed or never made.
   */
  async rebuild(leadId: string): Promise<{ status: 'BUILDING' }> {
    const lead = await this.repository.findForBuild(leadId);
    if (!lead) throw new NotFoundException('Lead not found');
    const request = storedRequestSchema.safeParse(lead.siteRequest);
    if (!request.success) throw new BadRequestException('This lead has no website request');
    const slug =
      lead.previewSlug && lead.previewStatus !== 'REMOVED'
        ? lead.previewSlug
        : await this.reserveOrThrow(request.data.business.name);
    await this.repository.update(leadId, {
      previewSlug: slug,
      previewStatus: 'BUILDING',
      previewBuiltAt: null,
    });
    this.start(
      leadId,
      slug,
      request.data,
      { name: lead.name, email: lead.email, locale: toApiLocale(lead.locale) },
      false,
    );
    return { status: 'BUILDING' };
  }

  /** Deletes the lead, taking its preview down first. */
  async deleteLead(actor: AuthUser, leadId: string): Promise<void> {
    if (await this.repository.hasPurchases(leadId)) {
      throw new ConflictException('This lead has an online purchase: its record is kept');
    }
    await this.remove(leadId);
    await this.leads.delete(actor, leadId);
  }

  private async reserveOrThrow(businessName: string): Promise<string> {
    if (!this.config.siteBuilder) {
      throw new ServiceUnavailableException('The site builder is not configured');
    }
    const slug = await this.reserve(businessName);
    if (!slug) {
      throw new HttpException(
        `No more previews today (${DAILY_PREVIEWS} a day); try again tomorrow`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return slug;
  }

  /** A preview's status, for the waiting page the requester opens; null when there is none. */
  async status(
    slug: string,
  ): Promise<{ status: PreviewStatus; url: string; business: string | null } | null> {
    const lead = await this.repository.findBySlug(slug);
    if (!lead?.previewStatus) return null;
    return {
      status: lead.previewStatus as PreviewStatus,
      url: this.urlOf(slug),
      business: lead.company,
    };
  }

  /** Takes the lead's preview down (the builder marks it; the host unpublishes it). */
  async remove(leadId: string): Promise<'REMOVED' | null> {
    const lead = await this.repository.find(leadId);
    if (!lead) throw new NotFoundException('Lead not found');
    if (!lead.previewSlug || lead.previewStatus === 'REMOVED')
      return lead.previewStatus ? 'REMOVED' : null;
    await this.builder.remove(lead.previewSlug);
    await this.repository.update(leadId, { previewStatus: 'REMOVED' });
    return 'REMOVED';
  }

  /** Previews past their 30 days, or of converted or spam leads. Never throws. */
  async removeDue(now = new Date()): Promise<void> {
    try {
      for (const lead of await this.repository.due(new Date(now.getTime() - KEEP_DAYS * DAY_MS))) {
        await this.remove(lead.id).catch((error: unknown) =>
          this.logger.warn(`Preview of lead ${lead.id} not removed: ${String(error)}`),
        );
      }
    } catch (error) {
      this.logger.error(`Preview removal run failed: ${String(error)}`);
    }
  }

  /**
   * Asks each requester whose preview has been ready for FOLLOW_UP_DAYS, and who nobody has
   * answered yet, what they think of it (once); the lead is flagged for follow-up that day when it
   * had no date. Never throws.
   */
  async sendFollowUps(now = new Date()): Promise<void> {
    try {
      const due = await this.repository.followUpsDue(
        new Date(now.getTime() - FOLLOW_UP_DAYS * DAY_MS),
      );
      for (const lead of due) {
        try {
          const locale = toApiLocale(lead.locale);
          await this.mail.send(
            previewFollowUpEmail(
              { name: lead.name, email: lead.email!, locale },
              lead.company ?? lead.name,
              this.urlOf(lead.previewSlug!),
              `${this.config.siteUrl}/${locale}/book`,
              this.config.siteUrl,
              this.buyLinkOf(lead.previewSlug!, locale),
            ),
          );
          await this.repository.update(lead.id, {
            previewFollowUpAt: now,
            ...(lead.followUpOn ? {} : { followUpOn: new Date(`${madridToday(now)}T00:00:00Z`) }),
          });
        } catch (error) {
          this.logger.warn(`Preview follow-up of lead ${lead.id} not sent: ${String(error)}`);
        }
      }
    } catch (error) {
      this.logger.error(`Preview follow-up run failed: ${String(error)}`);
    }
  }

  private async build(
    leadId: string,
    slug: string,
    request: SiteRequest,
    person: { name: string; email: string | null; locale: ApiLocale },
    notify: boolean,
  ): Promise<void> {
    const preset = (await this.builder.presets()).find((item) => item.key === request.preset);
    if (!preset) throw new Error(`No preset ${request.preset}`);
    const { url: _url, form: _form, demo: _demo, footerNote: _note, ...base } = preset.content;
    const parsed = siteContentSchema.parse({
      ...base,
      legal: {
        owner: request.business.name,
        taxId: '',
        address: request.business.address ?? request.business.city,
        email: request.business.email ?? person.email ?? mailboxOf(this.config.mailFrom),
      },
    });
    const content = siteContentSchema.parse(contentFromRequest(parsed, request));
    const url = this.urlOf(slug);
    const buy = this.buyLinkOf(slug, person.locale);
    const result = await this.builder.build({
      slug,
      preset: request.preset,
      domains: [`${slug}.${this.config.sitesPreviewDomain}`],
      content: {
        ...content,
        url,
        demo: true,
        form: { demo: true },
        preview: true,
        ...(buy ? { previewBuy: { url: buy.url, price: priceWithVat(buy, true) } } : {}),
      },
    });
    if (!result.ok) throw new Error(result.error.slice(-500));
    // Until the host serves it over HTTPS, its address answers with another site of the server.
    // Only production has a host that publishes it.
    if (this.config.isProduction && !(await this.waitLive(url)))
      throw new Error(`${url} not served after the build`);
    await this.repository.update(leadId, { previewStatus: 'READY', previewBuiltAt: new Date() });
    if (!notify || !person.email) return;
    await this.mail
      .send(
        previewReadyEmail(
          { ...person, email: person.email },
          request.business.name,
          url,
          this.config.siteUrl,
          buy,
        ),
      )
      .catch((error: unknown) => this.logger.error('Preview email failed', error));
  }

  /** Whether `url` answers 200 over HTTPS (a valid certificate) within LIVE_WAIT_MS. */
  async waitLive(url: string): Promise<boolean> {
    const until = Date.now() + LIVE_WAIT_MS;
    while (Date.now() < until) {
      const live = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(10_000) })
        .then((response) => response.status === 200)
        .catch(() => false);
      if (live) return true;
      await new Promise((resolve) => setTimeout(resolve, LIVE_POLL_MS));
    }
    return false;
  }
}

/** "200 €" */
export function priceLabel(cents: number): string {
  return `${(cents / 100).toLocaleString('es-ES', { maximumFractionDigits: 2 })} €`;
}

/** Buying the preview from its bar and emails (decision 20): where, and for how much. */
interface BuyLink {
  url: string;
  /** Before VAT: "200 €". */
  price: string;
  /** VAT added to it, in percent (0: none). */
  vat: number;
}

/** "200 € + IVA" / "200 € + VAT". */
function priceWithVat(buy: BuyLink, es: boolean): string {
  return buy.vat > 0 ? `${buy.price} + ${es ? 'IVA' : 'VAT'}` : buy.price;
}

/** `hello@x.com` from `Codeqlick <hello@x.com>`. */
export function mailboxOf(from: string): string {
  return /<([^>]+)>/.exec(from)?.[1] ?? from.trim();
}

/** To the requester: their preview is online (it takes Nginx a minute to publish it). */
function previewReadyEmail(
  person: { name: string; email: string; locale: ApiLocale },
  business: string,
  url: string,
  siteUrl: string,
  buy?: BuyLink,
) {
  const es = person.locale === 'es';
  return {
    to: person.email,
    subject: es
      ? `La vista previa de la web de ${business}`
      : `The preview of ${business}'s website`,
    ...renderEmail(
      {
        locale: person.locale,
        preheader: url,
        title: es ? 'Tu web, en vista previa' : 'Your website, as a preview',
        greeting: es ? `Hola ${person.name}:` : `Hi ${person.name},`,
        intro: es
          ? [
              `Hemos preparado una primera versión de la web de ${business} con lo que nos contaste. Es una vista previa: no está publicada ni aparece en Google.`,
              'Te escribiremos en breve para afinar los detalles, poner tus fotos y publicarla. Si quieres cambiar algo, responde a este correo.',
            ]
          : [
              `We made a first version of ${business}'s website with what you told us. It is a preview: it isn't published and doesn't show up on Google.`,
              "We'll write to you shortly to fine-tune it, add your photos and publish it. Want something changed? Just reply to this email.",
            ],
        button: { label: es ? 'Ver la vista previa' : 'Open the preview', url },
        ...(buy ? { outro: [buyLine(buy, es)] } : {}),
      },
      siteUrl,
    ),
  };
}

/** The line offering to buy the website as it is (decision 20). */
function buyLine(buy: BuyLink, es: boolean): string {
  return es
    ? `¿Te gusta tal cual? Puedes quedártela ya por ${priceWithVat(buy, true)}: la creamos al momento y la terminas tú desde tu área de cliente. ${buy.url}`
    : `Like it as it is? You can have it now for ${priceWithVat(buy, false)}: we make it at once and you finish it from your client area. ${buy.url}`;
}

/** To a requester nobody has answered yet, a few days after their preview: what do they think? */
function previewFollowUpEmail(
  person: { name: string; email: string; locale: ApiLocale },
  business: string,
  url: string,
  bookUrl: string,
  siteUrl: string,
  buy?: BuyLink,
) {
  const es = person.locale === 'es';
  return {
    to: person.email,
    subject: es
      ? `¿Qué te parece la web de ${business}?`
      : `What do you think of ${business}'s website?`,
    ...renderEmail(
      {
        locale: person.locale,
        preheader: es
          ? 'Cuéntanos qué cambiarías y la dejamos a tu gusto.'
          : "Tell us what you'd change and we'll make it yours.",
        title: es ? '¿Qué te ha parecido?' : 'What did you think?',
        greeting: es ? `Hola ${person.name}:` : `Hi ${person.name},`,
        intro: es
          ? [
              `Hace unos días te enviamos la vista previa de la web de ${business}. ¿Has podido verla?`,
              'Si quieres cambiar algo (textos, colores, fotos o secciones), responde a este correo y te contamos cómo dejarla a tu gusto. Y si te encaja tal cual, te enviamos la propuesta para publicarla en tu dominio.',
            ]
          : [
              `A few days ago we sent you the preview of ${business}'s website. Have you had a look?`,
              "Want something changed (texts, colours, photos or sections)? Reply to this email and we'll tell you how we'd make it yours. And if it fits as it is, we'll send you the proposal to publish it on your domain.",
            ],
        button: { label: es ? 'Ver la vista previa' : 'Open the preview', url },
        outro: [
          ...(buy ? [buyLine(buy, es)] : []),
          es
            ? `¿Prefieres hablarlo? Reserva una videollamada: ${bookUrl}`
            : `Rather talk it through? Book a video call: ${bookUrl}`,
        ],
      },
      siteUrl,
    ),
  };
}
