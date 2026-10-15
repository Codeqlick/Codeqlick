import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { attachmentDisposition } from './project-file-name.js';
import {
  createUpdateCommentSchema,
  projectFileParamSchema,
  updateParamSchema,
  type CreateUpdateCommentInput,
  type ProjectFileParam,
  type UpdateParam,
} from './projects.schemas.js';
import {
  ProjectsService,
  type ClientProjectView,
  type ProjectUpdateView,
  type UpdateCommentView,
} from './projects.service.js';

@ApiTags('portal')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('portal/projects')
export class PortalProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ClientProjectView[]> {
    return this.projects.listForCaller(user);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<ClientProjectView> {
    return this.projects.getForCaller(user, params.id);
  }

  @Post(':id/updates/:updateId/comments')
  addComment(
    @CurrentUser() user: AuthUser,
    @Param({ schema: updateParamSchema }) params: UpdateParam,
    @Body({ schema: createUpdateCommentSchema }) body: CreateUpdateCommentInput,
  ): Promise<UpdateCommentView> {
    return this.projects.addClientComment(user, params.id, params.updateId, body);
  }

  @Post(':id/updates/:updateId/approval')
  @HttpCode(HttpStatus.OK)
  approve(
    @CurrentUser() user: AuthUser,
    @Param({ schema: updateParamSchema }) params: UpdateParam,
  ): Promise<ProjectUpdateView> {
    return this.projects.approveUpdate(user, params.id, params.updateId);
  }

  /** Always an attachment of a generic type, so an uploaded HTML or SVG file can't run here. */
  @Get(':id/files/:fileId')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async downloadFile(
    @CurrentUser() user: AuthUser,
    @Param({ schema: projectFileParamSchema }) params: ProjectFileParam,
  ): Promise<StreamableFile> {
    const file = await this.projects.downloadFile(user, params.id, params.fileId);
    return new StreamableFile(file.stream, {
      type: 'application/octet-stream',
      length: file.size,
      disposition: attachmentDisposition(file.name),
    });
  }
}
