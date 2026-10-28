import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { MAX_IMAGE_BYTES } from '../media/media.service.js';
import {
  editableSiteSchema,
  sitePresetSchema,
  siteDomainBodySchema,
  type EditableSite,
  type SiteDomainBody,
} from './managed-sites.schemas.js';
import { PortalSitesService, type PortalSiteView } from './portal-sites.service.js';
import { SiteEditorService, type SiteEditorView } from './site-editor.service.js';

const HOUR_MS = 60 * 60 * 1000;
const editBodySchema = z.object({ site: editableSiteSchema }).strict();
/** The content is validated by the editor, which answers every issue with its path. */
const draftBodySchema = z
  .object({
    content: z.unknown(),
    preset: sitePresetSchema.optional(),
    rebuild: z.boolean().optional(),
  })
  .strict();
const styleBodySchema = z.object({ preset: sitePresetSchema }).strict();

@ApiTags('portal/site')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('portal/projects/:id/site')
export class PortalSitesController {
  constructor(
    private readonly sites: PortalSitesService,
    private readonly editor: SiteEditorService,
  ) {}

  /** The website editor: the draft (or the published content) and its preview (decision 18). */
  @Get('draft')
  draft(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<SiteEditorView> {
    return this.editor.view(user, params.id);
  }

  @Put('draft')
  @Throttle({ default: { limit: 600, ttl: HOUR_MS } })
  saveDraft(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: draftBodySchema }) body: z.infer<typeof draftBodySchema>,
  ): Promise<SiteEditorView> {
    return this.editor.save(user, params.id, body);
  }

  @Delete('draft')
  @HttpCode(HttpStatus.NO_CONTENT)
  async discardDraft(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    await this.editor.discard(user, params.id);
  }

  @Post('draft/publish')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: HOUR_MS } })
  publishDraft(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<SiteEditorView> {
    return this.editor.publish(user, params.id);
  }

  @Post('draft/style')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 60, ttl: HOUR_MS } })
  draftStyle(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: styleBodySchema }) body: z.infer<typeof styleBodySchema>,
  ): Promise<SiteEditorView> {
    return this.editor.applyStyle(user, params.id, body.preset);
  }

  @Get()
  get(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<PortalSiteView> {
    return this.sites.get(user, params.id);
  }

  @Put()
  @Throttle({ default: { limit: 30, ttl: HOUR_MS } })
  update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: editBodySchema }) body: { site: EditableSite },
  ): Promise<PortalSiteView> {
    return this.sites.update(user, params.id, body.site);
  }

  @Put('domain')
  @Throttle({ default: { limit: 10, ttl: HOUR_MS } })
  setDomain(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: siteDomainBodySchema }) body: SiteDomainBody,
  ): Promise<PortalSiteView> {
    return this.sites.setDomain(user, params.id, body.name);
  }

  @Post('images')
  @Throttle({ default: { limit: 60, ttl: HOUR_MS } })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ): Promise<{ file: string; url: string }> {
    return this.sites.uploadImage(user, params.id, file?.buffer);
  }
}
