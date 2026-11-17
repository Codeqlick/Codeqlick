import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Realm, RequestRealm } from '../../common/decorators/realm.decorator.js';
import type { RealmName } from '../../common/realm.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { AppRequest } from '../../common/types/request.js';
import type { AuthTokens } from './auth.service.js';
import {
  createSsoCodeSchema,
  exchangeSsoCodeSchema,
  type CreateSsoCodeInput,
  type ExchangeSsoCodeInput,
} from './sso.schemas.js';
import { SsoService } from './sso.service.js';

const PER_MINUTE = (limit: number) => ({ default: { limit, ttl: 60_000 } });

/** Single sign-on between the account host and the other hosts (architecture 4.3, decision 108). */
@ApiTags('auth')
@Realm('ANY')
@Controller('auth/sso')
export class SsoController {
  constructor(private readonly sso: SsoService) {}

  /** The account host asks for a one-time code for a client host (signed in). */
  @ApiBearerAuth()
  @Throttle(PER_MINUTE(30))
  @Post('codes')
  @HttpCode(HttpStatus.CREATED)
  createCode(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createSsoCodeSchema }) body: CreateSsoCodeInput,
  ): Promise<{ code: string; expiresIn: number }> {
    return this.sso.createCode(user, body.client, body.codeChallenge);
  }

  /** The client host's server exchanges the code and its PKCE verifier for a session. */
  @Public()
  @Throttle(PER_MINUTE(20))
  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  exchange(
    @Body({ schema: exchangeSsoCodeSchema }) body: ExchangeSsoCodeInput,
    @RequestRealm() realm: RealmName,
    @Req() request: AppRequest,
  ): Promise<AuthTokens> {
    const userAgent = request.headers['user-agent'];
    return this.sso.exchange(realm, body.client, body.code, body.codeVerifier, {
      userAgent: typeof userAgent === 'string' ? userAgent : null,
      ip: request.ip ?? null,
    });
  }
}
