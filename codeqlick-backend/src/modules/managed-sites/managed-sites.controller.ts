import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  createSiteSchema,
  revisionParamSchema,
  siteContentBodySchema,
  updateSiteSchema,
  type CreateSiteInput,
  type RevisionParam,
  type SiteContentBody,
  type UpdateSiteInput,
} from './managed-sites.schemas.js';
import {
  ManagedSitesService,
  type SiteRevisionView,
  type SiteView,
} from './managed-sites.service.js';

@ApiTags('admin/sites')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class ManagedSitesController {
  constructor(private readonly sites: ManagedSitesService) {}

  @Get('sites')
  list(): Promise<SiteView[]> {
    return this.sites.list();
  }

  @Get('projects/:id/site')
  async get(
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<SiteView | { exists: false }> {
    return (await this.sites.get(params.id)) ?? { exists: false };
  }

  @Post('projects/:id/site')
  create(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createSiteSchema }) body: CreateSiteInput,
  ): Promise<SiteView> {
    return this.sites.create(user, params.id, body);
  }

  @Patch('projects/:id/site')
  update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updateSiteSchema }) body: UpdateSiteInput,
  ): Promise<SiteView> {
    return this.sites.updateSettings(user, params.id, body);
  }

  @Put('projects/:id/site/content')
  content(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: siteContentBodySchema }) body: SiteContentBody,
  ): Promise<SiteView> {
    return this.sites.updateContent(user, params.id, body.content);
  }

  @Post('projects/:id/site/build')
  @HttpCode(HttpStatus.OK)
  build(@Param({ schema: idParamSchema }) params: IdParam): Promise<SiteView> {
    return this.sites.build(params.id);
  }

  @Get('projects/:id/site/revisions')
  revisions(@Param({ schema: idParamSchema }) params: IdParam): Promise<SiteRevisionView[]> {
    return this.sites.revisions(params.id);
  }

  @Post('projects/:id/site/revisions/:revisionId/restore')
  @HttpCode(HttpStatus.OK)
  restore(
    @CurrentUser() user: AuthUser,
    @Param({ schema: revisionParamSchema }) params: RevisionParam,
  ): Promise<SiteView> {
    return this.sites.restore(user, params.id, params.revisionId);
  }
}
