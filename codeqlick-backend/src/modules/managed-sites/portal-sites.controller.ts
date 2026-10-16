import {
  Body,
  Controller,
  Get,
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
import { editableSiteSchema, type EditableSite } from './managed-sites.schemas.js';
import { PortalSitesService, type PortalSiteView } from './portal-sites.service.js';

const HOUR_MS = 60 * 60 * 1000;
const editBodySchema = z.object({ site: editableSiteSchema }).strict();

@ApiTags('portal/site')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('portal/projects/:id/site')
export class PortalSitesController {
  constructor(private readonly sites: PortalSitesService) {}

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

  @Post('images')
  @Throttle({ default: { limit: 20, ttl: HOUR_MS } })
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
