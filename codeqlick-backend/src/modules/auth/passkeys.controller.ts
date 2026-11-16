import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { AppRequest } from '../../common/types/request.js';
import type { AuthTokens } from './auth.service.js';
import {
  passkeyLoginSchema,
  passkeyPasswordSchema,
  registerPasskeySchema,
  renamePasskeySchema,
  type PasskeyLoginInput,
  type PasskeyPasswordInput,
  type RegisterPasskeyInput,
  type RenamePasskeyInput,
} from './passkeys.schemas.js';
import { PasskeyService, type PasskeyLoginOptions, type PasskeyView } from './passkeys.service.js';

const PER_MINUTE = (limit: number) => ({ default: { limit, ttl: 60_000 } });

/** Passkeys (architecture 4.3, decision 104). */
@ApiTags('auth')
@Controller('auth/passkeys')
export class PasskeysController {
  constructor(private readonly passkeys: PasskeyService) {}

  /** A sign-in's challenge (discoverable credentials: the browser offers what it has). */
  @Public()
  @Throttle(PER_MINUTE(20))
  @Post('login/options')
  @HttpCode(HttpStatus.OK)
  loginOptions(): Promise<PasskeyLoginOptions> {
    return this.passkeys.loginOptions();
  }

  /** The browser's assertion: tokens like a password sign-in, with no code asked. */
  @Public()
  @Throttle(PER_MINUTE(10))
  @Post('login/verify')
  @HttpCode(HttpStatus.OK)
  login(
    @Body({ schema: passkeyLoginSchema }) body: PasskeyLoginInput,
    @Req() request: AppRequest,
  ): Promise<AuthTokens> {
    const userAgent = request.headers['user-agent'];
    return this.passkeys.login(body.challengeId, body.response as AuthenticationResponseJSON, {
      userAgent: typeof userAgent === 'string' ? userAgent : null,
      ip: request.ip ?? null,
    });
  }

  @ApiBearerAuth()
  @Get()
  list(@CurrentUser() user: AuthUser): Promise<{ items: PasskeyView[] }> {
    return this.passkeys.list(user.id);
  }

  @ApiBearerAuth()
  @Throttle(PER_MINUTE(5))
  @Post('register/options')
  @HttpCode(HttpStatus.OK)
  registrationOptions(
    @CurrentUser() user: AuthUser,
    @Body({ schema: passkeyPasswordSchema }) body: PasskeyPasswordInput,
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    return this.passkeys.registrationOptions(user.id, body.password);
  }

  @ApiBearerAuth()
  @Post('register/verify')
  @HttpCode(HttpStatus.CREATED)
  register(
    @CurrentUser() user: AuthUser,
    @Body({ schema: registerPasskeySchema }) body: RegisterPasskeyInput,
  ): Promise<PasskeyView> {
    return this.passkeys.register(user.id, body.response as RegistrationResponseJSON, body.name);
  }

  @ApiBearerAuth()
  @Patch(':id')
  rename(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: renamePasskeySchema }) body: RenamePasskeyInput,
  ): Promise<PasskeyView> {
    return this.passkeys.rename(user, params.id, body.name);
  }

  @ApiBearerAuth()
  @Throttle(PER_MINUTE(5))
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: passkeyPasswordSchema }) body: PasskeyPasswordInput,
  ): Promise<void> {
    await this.passkeys.remove(user, params.id, body.password);
  }
}
