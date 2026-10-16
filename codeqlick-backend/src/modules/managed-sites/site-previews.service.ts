import { randomBytes } from 'node:crypto';
import {
  Injectable,
  Logger,
  NotFoundException,
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
import { contentFromRequest, type SiteRequest } from './site-request.js';

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

  /** Builds the lead's preview in the background; the requester is emailed when it is ready. */
  start(
    leadId: string,
    slug: string,
    request: SiteRequest,
    person: { name: string; email: string; locale: ApiLocale },
  ): void {
    void this.build(leadId, slug, request, person).catch(async (error: unknown) => {
      this.logger.error(`Preview ${slug} failed: ${String(error)}`);
      await this.repository.update(leadId, { previewStatus: 'FAILED' }).catch(() => undefined);
    });
  }

  /** A preview's status, for the waiting page the requester opens; null when there is none. */
  async status(slug: string): Promise<{ status: PreviewStatus; url: string } | null> {
    const lead = await this.repository.findBySlug(slug);
    if (!lead?.previewStatus) return null;
    return { status: lead.previewStatus as PreviewStatus, url: this.urlOf(slug) };
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
              { name: lead.name, email: lead.email, locale },
              lead.company ?? lead.name,
              this.urlOf(lead.previewSlug!),
              `${this.config.siteUrl}/${locale}/book`,
              this.config.siteUrl,
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
    person: { name: string; email: string; locale: ApiLocale },
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
        email: request.business.email ?? person.email,
      },
    });
    const content = siteContentSchema.parse(contentFromRequest(parsed, request));
    const url = this.urlOf(slug);
    const result = await this.builder.build({
      slug,
      preset: request.preset,
      domains: [`${slug}.${this.config.sitesPreviewDomain}`],
      content: { ...content, url, demo: true, form: { demo: true }, preview: true },
    });
    if (!result.ok) throw new Error(result.error.slice(-500));
    // Until the host serves it over HTTPS, its address answers with another site of the server.
    // Only production has a host that publishes it.
    if (this.config.isProduction && !(await this.waitLive(url)))
      throw new Error(`${url} not served after the build`);
    await this.repository.update(leadId, { previewStatus: 'READY', previewBuiltAt: new Date() });
    await this.mail
      .send(previewReadyEmail(person, request.business.name, url, this.config.siteUrl))
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

/** To the requester: their preview is online (it takes Nginx a minute to publish it). */
function previewReadyEmail(
  person: { name: string; email: string; locale: ApiLocale },
  business: string,
  url: string,
  siteUrl: string,
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
      },
      siteUrl,
    ),
  };
}

/** To a requester nobody has answered yet, a few days after their preview: what do they think? */
function previewFollowUpEmail(
  person: { name: string; email: string; locale: ApiLocale },
  business: string,
  url: string,
  bookUrl: string,
  siteUrl: string,
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
          es
            ? `¿Prefieres hablarlo? Reserva una videollamada: ${bookUrl}`
            : `Rather talk it through? Book a video call: ${bookUrl}`,
        ],
      },
      siteUrl,
    ),
  };
}
