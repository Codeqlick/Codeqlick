import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { Public } from '../../common/decorators/public.decorator.js';
import { LeadsService } from '../leads/leads.service.js';
import { localeSchema, type ApiLocale } from '../../common/schemas/common.schemas.js';
import { SitePreviewsService, type PreviewStatus } from './site-previews.service.js';
import {
  SitePurchasesService,
  type PurchaseOffer,
  type PurchaseProgress,
} from './site-purchases.service.js';
import { requestSummary, siteRequestSchema, type SiteRequestInput } from './site-request.js';

const SLUG = /^[a-z0-9-]{1,40}$/;
const checkoutSchema = z.object({ locale: localeSchema, accept: z.literal(true) }).strict();

/** The public basic-website request (architecture 8.2): a lead that keeps the request. */
@ApiTags('site-requests')
@Controller('site-requests')
export class SiteRequestsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly previews: SitePreviewsService,
    private readonly purchases: SitePurchasesService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body({ schema: siteRequestSchema }) body: SiteRequestInput,
  ): Promise<{ id: string; previewUrl?: string }> {
    // Honeypot hit: pretend success so bots learn nothing.
    if (body.website && body.website.trim() !== '') return { id: randomUUID() };
    const request = { preset: body.preset, business: body.business, domain: body.domain };
    // The instant preview (architecture 8.2): its address goes in the team's email too.
    const slug = await this.previews.reserve(body.business.name);
    const previewUrl = slug ? this.previews.urlOf(slug) : undefined;
    const summary =
      requestSummary(request) +
      (slug ? `\n\nPreview: ${this.previews.waitingUrlOf(slug, body.locale)}` : '');
    const lead = await this.leads.create(
      {
        name: body.name,
        email: body.email,
        company: body.business.name,
        budget: undefined,
        projectType: 'web',
        message: summary.slice(0, 5000),
        locale: body.locale,
      },
      request,
      slug ?? undefined,
    );
    if (slug) {
      this.previews.start(lead.id, slug, request, {
        name: body.name,
        email: body.email,
        locale: body.locale,
      });
    }
    return { id: lead.id, ...(previewUrl ? { previewUrl } : {}) };
  }

  /** Whether a request's preview is online yet: the page the requester waits on asks this. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('previews/:slug')
  async preview(@Param('slug') slug: string): Promise<{
    status: PreviewStatus;
    url: string;
    business: string | null;
    purchase: PurchaseOffer | null;
  }> {
    const found = SLUG.test(slug) ? await this.previews.status(slug) : null;
    if (!found) throw new NotFoundException('Preview not found');
    return { ...found, purchase: await this.purchases.offer(slug) };
  }

  /** Stripe Checkout to buy the preview's website (architecture 8.2, decision 20). */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('previews/:slug/checkout')
  @HttpCode(HttpStatus.OK)
  checkout(
    @Param('slug') slug: string,
    @Body({ schema: checkoutSchema }) body: { locale: ApiLocale; accept: true },
  ): Promise<{ url: string }> {
    if (!SLUG.test(slug)) throw new NotFoundException('Preview not found');
    return this.purchases.checkout(slug, body.locale);
  }

  /** How a purchase is going, for the page Stripe returns to. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('purchases/:sessionId')
  async purchase(@Param('sessionId') sessionId: string): Promise<PurchaseProgress> {
    const found = /^cs_[A-Za-z0-9_]{1,250}$/.test(sessionId)
      ? await this.purchases.progress(sessionId)
      : null;
    if (!found) throw new NotFoundException('Purchase not found');
    return found;
  }
}
