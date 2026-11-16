import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Redirect,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CloudApi } from '../../common/decorators/cloud-api.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Caller, type CloudCtx } from './cloud-caller.js';
import {
  statusSubscribersQuerySchema,
  statusSubscribeSchema,
  statusSubscriberTokenParamSchema,
  statusSubscriberTokenSchema,
  statusTeamParamSchema,
  teamParamSchema,
  teamSubscriberParamSchema,
  type StatusSubscribeInput,
  type StatusSubscribersQuery,
  type StatusSubscriberTokenInput,
  type TeamParam,
  type TeamSubscriberParam,
} from './cloud.schemas.js';
import {
  CloudStatusSubscribersService,
  type StatusSubscriberList,
  type SubscriberResult,
} from './cloud-status-subscribers.service.js';

/** Signing up to a status page's notices by email, confirming and unsubscribing (decision 105). */
@ApiTags('cloud')
@Public()
@Controller('cloud')
export class CloudStatusSubscribersPublicController {
  constructor(private readonly subscribers: CloudStatusSubscribersService) {}

  @Post('status/:team/subscribers')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  subscribe(
    @Param({ schema: statusTeamParamSchema }) params: TeamParam,
    @Body({ schema: statusSubscribeSchema }) body: StatusSubscribeInput,
  ): Promise<void> {
    return this.subscribers.subscribe(params.team, body);
  }

  @Post('status-subscribers/confirm')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  confirm(
    @Body({ schema: statusSubscriberTokenSchema }) body: StatusSubscriberTokenInput,
  ): Promise<SubscriberResult> {
    return this.subscribers.confirm(body.token);
  }

  @Post('status-subscribers/unsubscribe')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  unsubscribe(
    @Body({ schema: statusSubscriberTokenSchema }) body: StatusSubscriberTokenInput,
  ): Promise<SubscriberResult> {
    return this.subscribers.unsubscribe(body.token);
  }

  /**
   * The address of the emails' `List-Unsubscribe` header opened in a browser: changes nothing (a
   * link scanner may open it) and sends the reader to the page whose button unsubscribes.
   */
  @Get('status-subscribers/unsubscribe/:token')
  @Redirect()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async unsubscribePage(
    @Param({ schema: statusSubscriberTokenParamSchema }) params: StatusSubscriberTokenInput,
  ): Promise<{ url: string; statusCode: number }> {
    return { url: await this.subscribers.unsubscribePageUrl(params.token), statusCode: 302 };
  }

  /**
   * One-click unsubscribe (RFC 8058): mail providers post `List-Unsubscribe=One-Click`; the body
   * carries nothing we need, so it is ignored.
   */
  @Post('status-subscribers/unsubscribe/:token')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async unsubscribeOneClick(
    @Param({ schema: statusSubscriberTokenParamSchema }) params: StatusSubscriberTokenInput,
  ): Promise<{ ok: true }> {
    await this.subscribers.unsubscribe(params.token);
    return { ok: true };
  }
}

/** A team's status page subscribers in the console (ADMIN; session or API token). */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@CloudApi()
@Controller('cloud')
export class CloudStatusSubscribersController {
  constructor(private readonly subscribers: CloudStatusSubscribersService) {}

  @Get('teams/:team/status-subscribers')
  list(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
    @Query({ schema: statusSubscribersQuerySchema }) query: StatusSubscribersQuery,
  ): Promise<StatusSubscriberList> {
    return this.subscribers.list(ctx, params.team, query);
  }

  @Delete('teams/:team/status-subscribers')
  removeAll(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamParamSchema }) params: TeamParam,
  ): Promise<{ deleted: number }> {
    return this.subscribers.removeAll(ctx, params.team);
  }

  @Delete('teams/:team/status-subscribers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Caller() ctx: CloudCtx,
    @Param({ schema: teamSubscriberParamSchema }) params: TeamSubscriberParam,
  ): Promise<void> {
    return this.subscribers.remove(ctx, params.team, params.id);
  }
}
