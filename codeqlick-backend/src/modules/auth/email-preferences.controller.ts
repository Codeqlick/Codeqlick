import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Query } from '@nestjs/common';
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

const LINK_LIMIT = { default: { limit: 30, ttl: 60_000 } };

/**
 * Unsubscribe links of the optional emails (architecture 4.3, decision 50): no session, the
 * signed token is the proof. Only `POST` and `PUT` change anything; `GET` is opened by link
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
  @Throttle(LINK_LIMIT)
  @Post('unsubscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(
    @Query({ schema: unsubscribeQuerySchema }) query: UnsubscribeQuery,
  ): Promise<void> {
    await this.preferences.unsubscribe(query.token);
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
