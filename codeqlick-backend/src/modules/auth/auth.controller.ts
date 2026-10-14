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
  loginSchema,
  logoutSchema,
  refreshSchema,
  requestPasswordResetSchema,
  type ChangePasswordInput,
  type ConfirmPasswordResetInput,
  type LoginInput,
  type LogoutInput,
  type RefreshInput,
  type RequestPasswordResetInput,
} from './auth.schemas.js';
import { AuthService, type AuthTokens, type ClientInfo } from './auth.service.js';

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
  ): Promise<AuthTokens> {
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
