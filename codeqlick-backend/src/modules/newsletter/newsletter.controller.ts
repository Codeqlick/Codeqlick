import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Redirect } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import {
  confirmSchema,
  subscribeSchema,
  unsubscribeParamSchema,
  unsubscribeSchema,
  type ConfirmInput,
  type SubscribeInput,
  type UnsubscribeInput,
  type UnsubscribeParam,
} from './newsletter.schemas.js';
import { NewsletterService } from './newsletter.service.js';

/** The blog newsletter's public endpoints (architecture 4.14). */
@ApiTags('newsletter')
@Controller('newsletter')
export class NewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  subscribe(@Body({ schema: subscribeSchema }) body: SubscribeInput): Promise<void> {
    return this.newsletter.subscribe(body);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirm(
    @Body({ schema: confirmSchema }) body: ConfirmInput,
  ): Promise<{ email: string; locale: ApiLocale }> {
    return this.newsletter.confirm(body.token);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('unsubscribe')
  @HttpCode(HttpStatus.OK)
  unsubscribe(
    @Body({ schema: unsubscribeSchema }) body: UnsubscribeInput,
  ): Promise<{ email: string }> {
    return this.newsletter.unsubscribe(body.token);
  }

  /**
   * The link of an email's footer, opened with a GET: changes nothing (a link scanner may open
   * it) and sends the reader to the page whose button unsubscribes.
   */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('unsubscribe/:token')
  @Redirect()
  async unsubscribePage(
    @Param({ schema: unsubscribeParamSchema }) params: UnsubscribeParam,
  ): Promise<{ url: string; statusCode: number }> {
    return { url: await this.newsletter.unsubscribePageUrl(params.token), statusCode: 302 };
  }

  /**
   * One-click unsubscribe (RFC 8058): the address in the emails' `List-Unsubscribe` header. A mail
   * provider posts `List-Unsubscribe=One-Click` (the RFC says multipart/form-data SHOULD be used,
   * urlencoded MAY); the body carries nothing we need, so it is ignored.
   */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('unsubscribe/:token')
  @HttpCode(HttpStatus.OK)
  unsubscribeOneClick(
    @Param({ schema: unsubscribeParamSchema }) params: UnsubscribeParam,
  ): Promise<{ email: string }> {
    return this.newsletter.unsubscribe(params.token);
  }
}
