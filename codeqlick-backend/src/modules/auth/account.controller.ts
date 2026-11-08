import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AccountService } from './account.service.js';
import {
  changeEmailSchema,
  confirmEmailChangeSchema,
  deleteAccountSchema,
  updateMeSchema,
  type ChangeEmailInput,
  type ConfirmEmailChangeInput,
  type DeleteAccountInput,
  type UpdateMeInput,
} from './auth.schemas.js';

const STRICT_LIMIT = { default: { limit: 5, ttl: 60_000 } };
const EXPORT_LIMIT = { default: { limit: 3, ttl: 3_600_000 } };

/** The caller's own account: name, email, a copy of their data, deleting it (architecture 5). */
@ApiTags('auth')
@Controller('auth')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @ApiBearerAuth()
  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body({ schema: updateMeSchema }) body: UpdateMeInput,
  ): Promise<AuthUser> {
    return this.account.updateMe(user.id, body);
  }

  @ApiBearerAuth()
  @Throttle(STRICT_LIMIT)
  @Post('email')
  @HttpCode(HttpStatus.ACCEPTED)
  async changeEmail(
    @CurrentUser() user: AuthUser,
    @Body({ schema: changeEmailSchema }) body: ChangeEmailInput,
  ): Promise<void> {
    await this.account.requestEmailChange(user.id, body);
  }

  /** Public: the emailed link may be opened on a device where nobody is signed in. */
  @Public()
  @Throttle(STRICT_LIMIT)
  @Post('email/confirm')
  @HttpCode(HttpStatus.OK)
  confirmEmail(
    @Body({ schema: confirmEmailChangeSchema }) body: ConfirmEmailChangeInput,
  ): Promise<{ email: string }> {
    return this.account.confirmEmailChange(body.token);
  }

  @ApiBearerAuth()
  @Throttle(EXPORT_LIMIT)
  @Get('me/export')
  async export(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) reply: Response,
  ): Promise<unknown> {
    const day = new Date().toISOString().slice(0, 10);
    reply.setHeader('Content-Disposition', `attachment; filename="codeqlick-${day}.json"`);
    reply.setHeader('Cache-Control', 'no-store');
    return this.account.export(user);
  }

  @ApiBearerAuth()
  @Throttle(STRICT_LIMIT)
  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMe(
    @CurrentUser() user: AuthUser,
    @Body({ schema: deleteAccountSchema }) body: DeleteAccountInput,
  ): Promise<void> {
    await this.account.deleteMe(user.id, body.password);
  }
}
