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
  createMilestoneSchema,
  createReleaseSchema,
  draftParamSchema,
  publishDraftSchema,
  type CreateReleaseInput,
  type DraftParam,
  type PublishDraftInput,
  createUpdateCommentSchema,
  updateParamSchema,
  type CreateUpdateCommentInput,
  type UpdateParam,
  createProjectSchema,
  createProjectUpdateSchema,
  listProjectsQuerySchema,
  milestoneParamSchema,
  projectFileParamSchema,
  reorderMilestonesSchema,
  updateMilestoneSchema,
  updateProjectSchema,
  type CreateMilestoneInput,
  type CreateProjectInput,
  type CreateProjectUpdateInput,
  type ListProjectsQuery,
  type MilestoneParam,
  type ProjectFileParam,
  type ReorderMilestonesInput,
  type UpdateMilestoneInput,
  type UpdateProjectInput,
} from './projects.schemas.js';
import { WeeklyDigestService, type DigestResult } from './weekly-digest.service.js';
import {
  MAX_PROJECT_FILE_BYTES,
  ProjectsService,
  type ClientProjectView,
  type ProjectFileView,
  type ProjectMilestoneView,
  type PostedProjectUpdate,
  type PostedTeamComment,
  type UpdateDraftView,
  type UploadedProjectFile,
} from './projects.service.js';

@ApiTags('admin/projects')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/projects')
export class AdminProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly digest: WeeklyDigestService,
  ) {}

  /** Sends a client their weekly summary now (to check it); `sent: false` when there's no news. */
  @Post('weekly-digest/:id')
  @HttpCode(HttpStatus.OK)
  sendDigest(@Param({ schema: idParamSchema }) params: IdParam): Promise<DigestResult> {
    return this.digest.sendNow(params.id);
  }

  @Get()
  list(
    @Query({ schema: listProjectsQuerySchema }) query: ListProjectsQuery,
  ): Promise<Paginated<ClientProjectView>> {
    return this.projects.list(query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createProjectSchema }) body: CreateProjectInput,
  ): Promise<ClientProjectView> {
    return this.projects.create(user, body);
  }

  /** Every project's drafts waiting for review (before `:id`, which would take "drafts"). */
  @Get('drafts')
  allDrafts(): Promise<UpdateDraftView[]> {
    return this.projects.listDrafts();
  }

  @Get(':id')
  get(@Param({ schema: idParamSchema }) params: IdParam): Promise<ClientProjectView> {
    return this.projects.get(params.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updateProjectSchema }) body: UpdateProjectInput,
  ): Promise<ClientProjectView> {
    return this.projects.update(user, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    await this.projects.delete(user, params.id);
  }

  @Post(':id/updates')
  addUpdate(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createProjectUpdateSchema }) body: CreateProjectUpdateInput,
  ): Promise<PostedProjectUpdate> {
    return this.projects.addUpdate(user, params.id, body);
  }

  @Post(':id/releases')
  addRelease(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createReleaseSchema }) body: CreateReleaseInput,
  ): Promise<PostedProjectUpdate> {
    return this.projects.addRelease(user, params.id, body);
  }

  @Get(':id/drafts')
  drafts(@Param({ schema: idParamSchema }) params: IdParam): Promise<UpdateDraftView[]> {
    return this.projects.listDrafts(params.id);
  }

  @Post(':id/drafts/:draftId/publish')
  publishDraft(
    @CurrentUser() user: AuthUser,
    @Param({ schema: draftParamSchema }) params: DraftParam,
    @Body({ schema: publishDraftSchema }) body: PublishDraftInput,
  ): Promise<PostedProjectUpdate> {
    return this.projects.publishDraft(user, params.id, params.draftId, body);
  }

  @Delete(':id/drafts/:draftId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async discardDraft(
    @CurrentUser() user: AuthUser,
    @Param({ schema: draftParamSchema }) params: DraftParam,
  ): Promise<void> {
    await this.projects.discardDraft(user, params.id, params.draftId);
  }

  /** A new key for the project's deploy pipeline (replaces the previous one); shown once. */
  @Post(':id/release-key')
  createReleaseKey(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<{ key: string }> {
    return this.projects.createReleaseKey(user, params.id);
  }

  @Delete(':id/release-key')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeReleaseKey(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    await this.projects.revokeReleaseKey(user, params.id);
  }

  @Post(':id/updates/:updateId/comments')
  addComment(
    @CurrentUser() user: AuthUser,
    @Param({ schema: updateParamSchema }) params: UpdateParam,
    @Body({ schema: createUpdateCommentSchema }) body: CreateUpdateCommentInput,
  ): Promise<PostedTeamComment> {
    return this.projects.addTeamComment(user, params.id, params.updateId, body);
  }

  @Post(':id/milestones')
  addMilestone(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createMilestoneSchema }) body: CreateMilestoneInput,
  ): Promise<ProjectMilestoneView> {
    return this.projects.addMilestone(user, params.id, body);
  }

  // Declared before ':id/milestones/:milestoneId' so "order" isn't read as a milestone id.
  @Put(':id/milestones/order')
  reorderMilestones(
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: reorderMilestonesSchema }) body: ReorderMilestonesInput,
  ): Promise<ProjectMilestoneView[]> {
    return this.projects.reorderMilestones(params.id, body);
  }

  @Patch(':id/milestones/:milestoneId')
  updateMilestone(
    @CurrentUser() user: AuthUser,
    @Param({ schema: milestoneParamSchema }) params: MilestoneParam,
    @Body({ schema: updateMilestoneSchema }) body: UpdateMilestoneInput,
  ): Promise<ProjectMilestoneView> {
    return this.projects.updateMilestone(user, params.id, params.milestoneId, body);
  }

  @Delete(':id/milestones/:milestoneId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMilestone(
    @CurrentUser() user: AuthUser,
    @Param({ schema: milestoneParamSchema }) params: MilestoneParam,
  ): Promise<void> {
    await this.projects.deleteMilestone(user, params.id, params.milestoneId);
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
    @CurrentUser() user: AuthUser,
    @Param({ schema: projectFileParamSchema }) params: ProjectFileParam,
  ): Promise<void> {
    await this.projects.deleteFile(user, params.id, params.fileId);
  }
}
