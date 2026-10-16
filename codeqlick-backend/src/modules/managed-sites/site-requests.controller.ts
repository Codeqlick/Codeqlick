import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import { Public } from '../../common/decorators/public.decorator.js';
import { LeadsService } from '../leads/leads.service.js';
import { SitePreviewsService } from './site-previews.service.js';
import { requestSummary, siteRequestSchema, type SiteRequestInput } from './site-request.js';

/** The public basic-website request (architecture 8.2): a lead that keeps the request. */
@ApiTags('site-requests')
@Controller('site-requests')
export class SiteRequestsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly previews: SitePreviewsService,
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
    const summary = requestSummary(request) + (previewUrl ? `\n\nPreview: ${previewUrl}` : '');
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
}
