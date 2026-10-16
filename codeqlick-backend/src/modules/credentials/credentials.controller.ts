import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  createCredentialSchema,
  credentialParamSchema,
  type CreateCredentialInput,
  type CredentialParam,
} from './credentials.schemas.js';
import { CredentialsService, type CredentialView } from './credentials.service.js';

@ApiTags('credentials')
@ApiBearerAuth()
@Controller()
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Roles('CLIENT', 'ADMIN')
  @Get('portal/projects/:id/credentials')
  list(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<CredentialView[]> {
    return this.credentials.list(user, params.id);
  }

  @Roles('CLIENT', 'ADMIN')
  @Post('portal/projects/:id/credentials')
  create(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createCredentialSchema }) body: CreateCredentialInput,
  ): Promise<CredentialView> {
    return this.credentials.create(user, params.id, body);
  }

  @Roles('CLIENT', 'ADMIN')
  @Delete('portal/projects/:id/credentials/:credentialId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param({ schema: credentialParamSchema }) params: CredentialParam,
  ): Promise<void> {
    await this.credentials.remove(user, params.id, params.credentialId);
  }

  /** The secret itself: the team only, logged. */
  @Roles('ADMIN')
  @Post('admin/projects/:id/credentials/:credentialId/reveal')
  @HttpCode(HttpStatus.OK)
  reveal(
    @CurrentUser() user: AuthUser,
    @Param({ schema: credentialParamSchema }) params: CredentialParam,
  ) {
    return this.credentials.reveal(user, params.id, params.credentialId);
  }

  @Roles('ADMIN')
  @Delete('admin/projects/:id/credentials')
  removeAll(@CurrentUser() user: AuthUser, @Param({ schema: idParamSchema }) params: IdParam) {
    return this.credentials.removeAll(user, params.id);
  }
}
