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
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  createSiteSchema,
  onboardSiteSchema,
  revisionParamSchema,
  siteContentBodySchema,
  updateSiteSchema,
  type CreateSiteInput,
  type OnboardSiteInput,
  type RevisionParam,
  type SiteContentBody,
  type UpdateSiteInput,
} from './managed-sites.schemas.js';
import {
  ManagedSitesService,
  type SiteRevisionView,
  type SiteView,
} from './managed-sites.service.js';
import { SiteDomainsService } from './site-domains.service.js';
import { SitePreviewsService, type PreviewListItem } from './site-previews.service.js';
import {
  prospectSchema,
  storedRequestSchema,
  type ProspectInput,
  type SiteRequest,
} from './site-request.js';
import type { Lead } from '../leads/leads.service.js';
import { SiteProposalsService, type RequestProposalResult } from './site-proposals.service.js';
import { SiteReportsService } from './site-reports.service.js';
import { SiteOnboardingService, type OnboardResult } from './site-onboarding.service.js';

@ApiTags('admin/sites')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class ManagedSitesController {
  constructor(
    private readonly sites: ManagedSitesService,
    private readonly onboarding: SiteOnboardingService,
    private readonly siteDomains: SiteDomainsService,
    private readonly previews: SitePreviewsService,
    private readonly requestProposals: SiteProposalsService,
    private readonly reports: SiteReportsService,
  ) {}

  /** A basic-website client in one step (account, project, site, form, monitor, first build). */
  @Post('sites/onboard')
  onboard(
    @CurrentUser() user: AuthUser,
    @Body({ schema: onboardSiteSchema }) body: OnboardSiteInput,
  ): Promise<OnboardResult> {
    return this.onboarding.onboard(user, body);
  }

  /** Takes a website request's preview down (architecture 8.2). */
  @Delete('leads/:id/preview')
  async removePreview(
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<{ status: 'REMOVED' | null }> {
    return { status: await this.previews.remove(params.id) };
  }

  /** (Re)builds a lead's preview from its request, emailing nobody (architecture 8.2). */
  @Post('leads/:id/preview')
  @HttpCode(HttpStatus.OK)
  rebuildPreview(
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<{ status: 'BUILDING' }> {
    return this.previews.rebuild(params.id);
  }

  /** Replaces a lead's website request and rebuilds its preview. */
  @Put('leads/:id/request')
  editRequest(
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: storedRequestSchema }) body: SiteRequest,
  ): Promise<Lead> {
    return this.previews.editRequest(params.id, body);
  }

  /** Deletes a lead and takes its preview down. */
  @Delete('leads/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLead(
    @CurrentUser() actor: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    await this.previews.deleteLead(actor, params.id);
  }

  /** Every preview (Admin → Vistas previas). */
  @Get('previews')
  previewList(): Promise<PreviewListItem[]> {
    return this.previews.list();
  }

  /** A prospect: the preview of a business that hasn't asked yet (architecture 8.2). */
  @Post('previews')
  @HttpCode(HttpStatus.CREATED)
  createProspect(
    @CurrentUser() actor: AuthUser,
    @Body({ schema: prospectSchema }) body: ProspectInput,
  ): Promise<{ leadId: string }> {
    return this.previews.createProspect(actor, body);
  }

  /** Drafts the proposal for a website request (architecture 8.2). */
  @Post('leads/:id/proposal')
  @HttpCode(HttpStatus.CREATED)
  proposeFromRequest(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<RequestProposalResult> {
    return this.requestProposals.draft(user, params.id);
  }

  /** Sends last month's website report of the project's site now (architecture 8.2). */
  @Post('projects/:id/site/report')
  @HttpCode(HttpStatus.OK)
  async sendReport(@Param({ schema: idParamSchema }) params: IdParam): Promise<{ sent: number }> {
    return { sent: await this.reports.sendNow(params.id) };
  }

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
  async create(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createSiteSchema }) body: CreateSiteInput,
  ): Promise<SiteView> {
    const site = await this.sites.create(user, params.id, body);
    if (site.domain) this.siteDomains.checkSoon(params.id);
    return site;
  }

  @Patch('projects/:id/site')
  async update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updateSiteSchema }) body: UpdateSiteInput,
  ): Promise<SiteView> {
    const site = await this.sites.updateSettings(user, params.id, body);
    if (site.domain) this.siteDomains.checkSoon(params.id);
    return site;
  }

  /** Checks where the site's domain stands now (and connects it through OVH when it can). */
  @Post('projects/:id/site/domain/check')
  @HttpCode(HttpStatus.OK)
  checkDomain(@Param({ schema: idParamSchema }) params: IdParam): Promise<SiteView> {
    return this.siteDomains.check(params.id);
  }

  @Put('projects/:id/site/content')
  content(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: siteContentBodySchema }) body: SiteContentBody,
  ): Promise<SiteView> {
    return this.sites.updateContent(user, params.id, body.content);
  }

  /** Takes the managed site down (architecture 8.2). */
  @Delete('projects/:id/site')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() actor: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    await this.sites.remove(actor, params.id);
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
