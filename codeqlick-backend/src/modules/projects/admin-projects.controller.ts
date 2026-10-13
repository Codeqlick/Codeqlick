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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Paginated } from '../../common/types/paginated.js';
import {
  createProjectSchema,
  createProjectUpdateSchema,
  listProjectsQuerySchema,
  updateProjectSchema,
  type CreateProjectInput,
  type CreateProjectUpdateInput,
  type ListProjectsQuery,
  type UpdateProjectInput,
} from './projects.schemas.js';
import {
  ProjectsService,
  type ClientProjectView,
  type ProjectUpdateView,
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
}
