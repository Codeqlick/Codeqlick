import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { AppRequest } from '../../common/types/request.js';
import {
  changePasswordSchema,
  confirmPasswordResetSchema,
  disableTwoFactorSchema,
  enableTwoFactorSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  requestPasswordResetSchema,
  verifyTwoFactorSchema,
  type ChangePasswordInput,
  type ConfirmPasswordResetInput,
  type DisableTwoFactorInput,
  type EnableTwoFactorInput,
  type LoginInput,
  type LogoutInput,
  type RefreshInput,
  type RequestPasswordResetInput,
  type VerifyTwoFactorInput,
} from './auth.schemas.js';
import {
  AuthService,
  type AuthTokens,
  type ClientInfo,
  type LoginResult,
  type TwoFactorSetup,
  type TwoFactorStatus,
} from './auth.service.js';

const STRICT_LIMIT = { default: { limit: 5, ttl: 60_000 } };

function clientInfo(request: AppRequest): ClientInfo {
  const userAgent = request.headers['user-agent'];
  return { userAgent: typeof userAgent === 'string' ? userAgent : null, ip: request.ip ?? null };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(STRICT_LIMIT)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(
    @Body({ schema: loginSchema }) body: LoginInput,
    @Req() request: AppRequest,
  ): Promise<LoginResult> {
    return this.auth.login(body.email, body.password, clientInfo(request));
  }

  @Public()
  @Throttle(STRICT_LIMIT)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body({ schema: refreshSchema }) body: RefreshInput,
    @Req() request: AppRequest,
  ): Promise<AuthTokens> {
    return this.auth.refresh(body.refreshToken, clientInfo(request));
  }

  /** Always 202, whether or not the email belongs to an account. */
  @Public()
  @Throttle(STRICT_LIMIT)
  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  async requestPasswordReset(
    @Body({ schema: requestPasswordResetSchema }) body: RequestPasswordResetInput,
  ): Promise<void> {
    await this.auth.requestPasswordReset(body.email, body.locale);
  }

  @Public()
  @Throttle(STRICT_LIMIT)
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmPasswordReset(
    @Body({ schema: confirmPasswordResetSchema }) body: ConfirmPasswordResetInput,
  ): Promise<void> {
    await this.auth.confirmPasswordReset(body.token, body.newPassword);
  }

  /** Second step of a login when `POST /auth/login` answered `{ twoFactorRequired: true }`. */
  @Public()
  @Throttle(STRICT_LIMIT)
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  verifyTwoFactor(
    @Body({ schema: verifyTwoFactorSchema }) body: VerifyTwoFactorInput,
    @Req() request: AppRequest,
  ): Promise<AuthTokens> {
    return this.auth.verifyTwoFactor(body.challengeToken, body.code, clientInfo(request));
  }

  @ApiBearerAuth()
  @Get('2fa')
  twoFactorStatus(@CurrentUser() user: AuthUser): Promise<TwoFactorStatus> {
    return this.auth.twoFactorStatus(user.id);
  }

  @ApiBearerAuth()
  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  startTwoFactorSetup(@CurrentUser() user: AuthUser): Promise<TwoFactorSetup> {
    return this.auth.startTwoFactorSetup(user.id);
  }

  @ApiBearerAuth()
  @Throttle(STRICT_LIMIT)
  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  enableTwoFactor(
    @CurrentUser() user: AuthUser,
    @Body({ schema: enableTwoFactorSchema }) body: EnableTwoFactorInput,
  ): Promise<{ recoveryCodes: string[] }> {
    return this.auth.enableTwoFactor(user.id, body.code);
  }

  @ApiBearerAuth()
  @Throttle(STRICT_LIMIT)
  @Post('2fa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disableTwoFactor(
    @CurrentUser() user: AuthUser,
    @Body({ schema: disableTwoFactorSchema }) body: DisableTwoFactorInput,
  ): Promise<void> {
    await this.auth.disableTwoFactor(user.id, body.password, body.code);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentUser() user: AuthUser,
    @Body({ schema: logoutSchema }) body: LogoutInput,
  ): Promise<void> {
    await this.auth.logout(user.id, body.refreshToken);
  }

  @ApiBearerAuth()
  @Throttle(STRICT_LIMIT)
  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body({ schema: changePasswordSchema }) body: ChangePasswordInput,
  ): Promise<void> {
    await this.auth.changePassword(
      user.id,
      body.currentPassword,
      body.newPassword,
      body.refreshToken,
    );
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<AuthUser> {
    return this.auth.me(user.id);
  }
}
