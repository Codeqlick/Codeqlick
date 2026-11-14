import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  Redirect,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  emailPreferenceSchema,
  unsubscribeQuerySchema,
  type EmailPreferenceInput,
  type UnsubscribeQuery,
} from './auth.schemas.js';
import { EmailPreferencesService, type EmailPreference } from './email-preferences.service.js';

/** Routes a person's browser calls. */
const LINK_LIMIT = { default: { limit: 30, ttl: 60_000 } };
/** Mail providers call the one-click POST from a few shared addresses. */
const ONE_CLICK_LIMIT = { default: { limit: 120, ttl: 60_000 } };

/**
 * Unsubscribe links of the optional emails (architecture 4.3, decision 70): no session, the
 * signed token is the proof. Only `POST` and `PUT` change anything; `GET`s are opened by link
 * scanners and previews.
 */
@ApiTags('auth')
@Controller('email')
export class EmailPreferencesController {
  constructor(private readonly preferences: EmailPreferencesService) {}

  /**
   * RFC 8058 one-click unsubscribe, called by mail providers from `List-Unsubscribe`. Their body
   * (form-urlencoded `List-Unsubscribe=One-Click`) is ignored.
   */
  @Public()
  @Throttle(ONE_CLICK_LIMIT)
  @Post('unsubscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(
    @Query({ schema: unsubscribeQuerySchema }) query: UnsubscribeQuery,
  ): Promise<void> {
    await this.preferences.unsubscribe(query.token);
  }

  /**
   * The one-click URL opened in a browser (a mail app showing the header as a link): sends the
   * person to the website's page. Changes nothing, since link scanners open it too.
   */
  @Public()
  @Throttle(LINK_LIMIT)
  @Get('unsubscribe')
  @Redirect('', HttpStatus.FOUND)
  async page(
    @Query({ schema: unsubscribeQuerySchema }) query: UnsubscribeQuery,
  ): Promise<{ url: string; statusCode: number }> {
    return { url: await this.preferences.pageUrl(query.token), statusCode: HttpStatus.FOUND };
  }

  /** What the website's unsubscribe page shows. Changes nothing. */
  @Public()
  @Throttle(LINK_LIMIT)
  @Get('preferences')
  get(
    @Query({ schema: unsubscribeQuerySchema }) query: UnsubscribeQuery,
  ): Promise<EmailPreference> {
    return this.preferences.get(query.token);
  }

  /** The website's "Unsubscribe" and "Undo" buttons. */
  @Public()
  @Throttle(LINK_LIMIT)
  @Put('preferences')
  set(
    @Body({ schema: emailPreferenceSchema }) body: EmailPreferenceInput,
  ): Promise<EmailPreference> {
    return this.preferences.set(body.token, body.subscribed);
  }
}
