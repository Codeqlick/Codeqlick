import { Body, Controller, Get, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CloudApi } from '../../common/decorators/cloud-api.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import { Caller, type CloudCtx } from './cloud-caller.js';
import { PROTECTION_PAGE_HEADERS, renderProtectionPage } from './cloud-protection-page.js';
import { ACCESS_COOKIE, accessCookieOptions, nextFromUrl, pageLocale } from './cloud-protection.js';
import {
  CloudProtectionService,
  type ProtectionView,
  type ProxyHeaders,
  type VisitorAnswer,
} from './cloud-protection.service.js';
import {
  protectionSchema,
  protectionTicketQuerySchema,
  type ProtectionInput,
  type ProtectionTicketQuery,
} from './cloud.schemas.js';

/** The headers the hosting site's Nginx sends (deploy/nginx/cloud-protection.conf). */
function proxyHeaders(request: Request): ProxyHeaders {
  const one = (name: string) => {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  return {
    key: one('x-cq-protection-key'),
    host: one('x-cq-host'),
    slug: one('x-cq-project'),
    kind: one('x-cq-kind'),
    access: one('x-cq-access'),
  };
}

/** Answers a visitor: the password page (EN/ES) or a `303` with the access cookie. */
function answer(request: Request, res: Response, result: VisitorAnswer): void {
  for (const [name, value] of Object.entries(PROTECTION_PAGE_HEADERS)) res.setHeader(name, value);
  if (result.type === 'redirect') {
    if (result.cookie) {
      res.cookie(ACCESS_COOKIE, result.cookie.value, accessCookieOptions(result.cookie.days));
    }
    res.redirect(303, result.location);
    return;
  }
  const html = renderProtectionPage({
    locale: pageLocale(request.headers['accept-language']),
    projectName: result.projectName,
    next: result.next,
    error: result.error,
  });
  res.status(result.status).type('html').send(html);
}

/**
 * What the hosting sites' Nginx asks (architecture 4.13 "Password protection"): the check of
 * every request of a protected address, and the visitor's `/__codeqlick/` pages. Every route
 * needs `X-Cq-Protection-Key`; `api.codeqlick.com` doesn't serve them.
 */
@ApiExcludeController()
@Public()
@Controller('cloud/protection')
export class CloudProtectionPublicController {
  constructor(private readonly protection: CloudProtectionService) {}

  /** `204` let through, `401` ask for the password (Nginx caches it 60 s). */
  @Get('check')
  @SkipThrottle()
  async check(@Req() request: Request, @Res() res: Response): Promise<void> {
    const through = await this.protection.check(proxyHeaders(request));
    res.setHeader('Cache-Control', 'no-store');
    res.status(through ? 204 : 401).end();
  }

  @Get('password')
  async page(@Req() request: Request, @Res() res: Response): Promise<void> {
    const next = nextFromUrl(request.originalUrl);
    answer(request, res, await this.protection.page(proxyHeaders(request), next));
  }

  @Post('password')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async submit(
    @Req() request: Request,
    @Body() body: unknown,
    @Res() res: Response,
  ): Promise<void> {
    const form = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const result = await this.protection.submit(
      proxyHeaders(request),
      request.ip?.slice(0, 45) ?? null,
      { password: form.password, next: form.next },
    );
    answer(request, res, result);
  }

  @Get('enter')
  async enter(@Req() request: Request, @Res() res: Response): Promise<void> {
    const ticket = request.query.ticket;
    const value = typeof ticket === 'string' ? ticket : undefined;
    answer(request, res, await this.protection.enter(proxyHeaders(request), value));
  }
}

/** A project's password protection, for its team (session or API token). */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@CloudApi()
@Controller('cloud/projects/:id/protection')
export class CloudProtectionController {
  constructor(private readonly protection: CloudProtectionService) {}

  @Get()
  get(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<ProtectionView> {
    return this.protection.get(ctx, params.id);
  }

  @Put()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  update(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: protectionSchema }) body: ProtectionInput,
  ): Promise<ProtectionView> {
    return this.protection.update(ctx, params.id, body);
  }

  @Get('ticket')
  ticket(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: protectionTicketQuerySchema }) query: ProtectionTicketQuery,
  ): Promise<{ url: string; expiresIn: number }> {
    return this.protection.ticket(ctx, params.id, query.host);
  }
}
