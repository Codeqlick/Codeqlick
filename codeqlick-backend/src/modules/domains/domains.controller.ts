import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { domainSettingsSchema, type DomainSettingsInput } from './domains.schemas.js';
import { DomainsService, type DomainView } from './domains.service.js';

@ApiTags('admin/projects')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/projects/:id/domain')
export class DomainsController {
  constructor(private readonly domains: DomainsService) {}

  @Get()
  get(@Param({ schema: idParamSchema }) params: IdParam): Promise<DomainView> {
    return this.domains.get(params.id);
  }

  @Put()
  save(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: domainSettingsSchema }) body: DomainSettingsInput,
  ): Promise<DomainView> {
    return this.domains.save(user, params.id, body);
  }

  @Post('check')
  @HttpCode(HttpStatus.OK)
  check(@Param({ schema: idParamSchema }) params: IdParam): Promise<DomainView> {
    return this.domains.check(params.id);
  }
}
