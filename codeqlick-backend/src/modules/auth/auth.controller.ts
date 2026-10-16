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
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { AppRequest } from '../../common/types/request.js';
import {
  acceptInvitationSchema,
  changePasswordSchema,
  confirmSignupSchema,
  confirmPasswordResetSchema,
  disableTwoFactorSchema,
  enableTwoFactorSchema,
  loginSchema,
  logoutSchema,
  preferencesSchema,
  refreshSchema,
  registerSchema,
  requestPasswordResetSchema,
  verifyTwoFactorSchema,
  type AcceptInvitationInput,
  type ChangePasswordInput,
  type ConfirmSignupInput,
  type ConfirmPasswordResetInput,
  type DisableTwoFactorInput,
  type EnableTwoFactorInput,
  type LoginInput,
  type LogoutInput,
  type PreferencesInput,
  type RefreshInput,
  type RegisterInput,
  type RequestPasswordResetInput,
  type VerifyTwoFactorInput,
} from './auth.schemas.js';
import {
  AuthService,
  type ActiveSession,
  type AuthTokens,
  type ClientInfo,
  type LoginResult,
  type Preferences,
  type TwoFactorSetup,
  type TwoFactorStatus,
} from './auth.service.js';

const STRICT_LIMIT = { default: { limit: 5, ttl: 60_000 } };
const SIGNUP_LIMIT = { default: { limit: 3, ttl: 60_000 } };

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

  /** Self-registration (decision 17): always 202, whether or not the email has an account. */
  @Public()
  @Throttle(SIGNUP_LIMIT)
  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  async register(@Body({ schema: registerSchema }) body: RegisterInput): Promise<void> {
    await this.auth.register(body);
  }

  /** The link of the confirmation email: creates the account and signs in. */
  @Public()
  @Throttle(STRICT_LIMIT)
  @Post('register/confirm')
  @HttpCode(HttpStatus.OK)
  confirmSignup(
    @Body({ schema: confirmSignupSchema }) body: ConfirmSignupInput,
    @Req() request: AppRequest,
  ): Promise<AuthTokens> {
    return this.auth.confirmSignup(body.token, clientInfo(request));
  }

  /** Who the team's invitation is for, to fill in the sign-up form. */
  @Public()
  @Throttle(STRICT_LIMIT)
  @Get('register/invitation')
  invitation(
    @Query({ schema: confirmSignupSchema }) query: ConfirmSignupInput,
  ): Promise<{ email: string; name: string }> {
    return this.auth.invitation(query.token);
  }

  /** Accepts the team's invitation: the account is theirs and they are signed in. */
  @Public()
  @Throttle(STRICT_LIMIT)
  @Post('register/invitation')
  @HttpCode(HttpStatus.OK)
  acceptInvitation(
    @Body({ schema: acceptInvitationSchema }) body: AcceptInvitationInput,
    @Req() request: AppRequest,
  ): Promise<AuthTokens> {
    return this.auth.acceptInvitation(body, clientInfo(request));
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
  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser): Promise<ActiveSession[]> {
    return this.auth.listSessions(user.id, user.sessionId);
  }

  /** Signs out every other device; `refreshToken` is the session that stays signed in. */
  @ApiBearerAuth()
  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeOtherSessions(
    @CurrentUser() user: AuthUser,
    @Body({ schema: logoutSchema }) body: LogoutInput,
  ): Promise<void> {
    await this.auth.revokeOtherSessions(user, body.refreshToken);
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    await this.auth.revokeSession(user, params.id);
  }

  @ApiBearerAuth()
  @Get('preferences')
  preferences(@CurrentUser() user: AuthUser): Promise<Preferences> {
    return this.auth.preferences(user.id);
  }

  @ApiBearerAuth()
  @Patch('preferences')
  updatePreferences(
    @CurrentUser() user: AuthUser,
    @Body({ schema: preferencesSchema }) body: PreferencesInput,
  ): Promise<Preferences> {
    return this.auth.updatePreferences(user.id, body);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser): Promise<AuthUser> {
    return this.auth.me(user.id);
  }
}
