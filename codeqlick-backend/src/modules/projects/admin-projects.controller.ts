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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Paginated } from '../../common/types/paginated.js';
import {
  createProjectSchema,
  createProjectUpdateSchema,
  listProjectsQuerySchema,
  projectFileParamSchema,
  updateProjectSchema,
  type CreateProjectInput,
  type CreateProjectUpdateInput,
  type ListProjectsQuery,
  type ProjectFileParam,
  type UpdateProjectInput,
} from './projects.schemas.js';
import {
  MAX_PROJECT_FILE_BYTES,
  ProjectsService,
  type ClientProjectView,
  type ProjectFileView,
  type ProjectUpdateView,
  type UploadedProjectFile,
} from './projects.service.js';

@ApiTags('admin/projects')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/projects')
export class AdminProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list(
    @Query({ schema: listProjectsQuerySchema }) query: ListProjectsQuery,
  ): Promise<Paginated<ClientProjectView>> {
    return this.projects.list(query);
  }

  @Post()
  create(
    @Body({ schema: createProjectSchema }) body: CreateProjectInput,
  ): Promise<ClientProjectView> {
    return this.projects.create(body);
  }

  @Get(':id')
  get(@Param({ schema: idParamSchema }) params: IdParam): Promise<ClientProjectView> {
    return this.projects.get(params.id);
  }

  @Patch(':id')
  update(
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updateProjectSchema }) body: UpdateProjectInput,
  ): Promise<ClientProjectView> {
    return this.projects.update(params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param({ schema: idParamSchema }) params: IdParam): Promise<void> {
    await this.projects.delete(params.id);
  }

  @Post(':id/updates')
  addUpdate(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createProjectUpdateSchema }) body: CreateProjectUpdateInput,
  ): Promise<ProjectUpdateView> {
    return this.projects.addUpdate(user, params.id, body);
  }

  @Post(':id/files')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_PROJECT_FILE_BYTES, files: 1 },
      // Browsers send UTF-8 file names; multer would otherwise read them as Latin-1.
      defParamCharset: 'utf8',
    }),
  )
  addFile(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @UploadedFile() file: UploadedProjectFile | undefined,
  ): Promise<ProjectFileView> {
    return this.projects.addFile(user, params.id, file);
  }

  @Delete(':id/files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFile(
    @Param({ schema: projectFileParamSchema }) params: ProjectFileParam,
  ): Promise<void> {
    await this.projects.deleteFile(params.id, params.fileId);
  }
}
