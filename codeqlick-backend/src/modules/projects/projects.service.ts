import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import { toApiLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import {
  Role,
  type Prisma,
  type ProjectFile,
  type ProjectMilestone,
  type ProjectPhase,
} from '../../generated/prisma/client.js';
import {
  ProjectsRepository,
  type CommentWithAuthor,
  type ProjectWithClient,
  type ProjectWithUpdates,
  type UpdateWithAuthor,
} from './projects.repository.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { clientActivityEmail, projectUpdateEmail, teamCommentEmail } from './project-emails.js';
import { cleanContentType, cleanFileName } from './project-file-name.js';
import { ProjectFilesStorage } from './project-files.storage.js';
import type {
  CreateMilestoneInput,
  CreateProjectInput,
  CreateProjectUpdateInput,
  CreateUpdateCommentInput,
  ListProjectsQuery,
  ReorderMilestonesInput,
  UpdateMilestoneInput,
  UpdateProjectInput,
} from './projects.schemas.js';

export interface UpdateCommentView {
  id: string;
  body: string;
  createdAt: string;
  /** `team`: written by Codeqlick (an admin); otherwise by the client. */
  author: { name: string; team: boolean };
}

export interface ProjectUpdateView {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: { name: string };
  approvalRequested: boolean;
  approvedAt: string | null;
  approvedBy: { name: string } | null;
  comments: UpdateCommentView[];
}

/** A comment posted by the team; `clientNotified` says whether the client was emailed it. */
export type PostedTeamComment = UpdateCommentView & { clientNotified: boolean };

/** A posted update; `clientNotified` only when the client was to be emailed. */
export type PostedProjectUpdate = ProjectUpdateView & { clientNotified?: boolean };

/** Largest file accepted for a project, in bytes. */
export const MAX_PROJECT_FILE_BYTES = 25 * 1024 * 1024;

export interface ProjectFileView {
  id: string;
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
}

export interface UploadedProjectFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}

export interface ProjectFileDownload {
  stream: ReadStream;
  name: string;
  size: number;
}

export interface ProjectMilestoneView {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  completedAt: string | null;
}

export interface ClientProjectView {
  id: string;
  name: string;
  description: string | null;
  phase: ProjectPhase;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  stagingUrl: string | null;
  productionUrl: string | null;
  showHours: boolean;
  client: { id: string; name: string; email: string };
  updates?: ProjectUpdateView[];
  files?: ProjectFileView[];
  milestones?: ProjectMilestoneView[];
  createdAt: string;
  updatedAt: string;
}

function toCommentView(comment: CommentWithAuthor): UpdateCommentView {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    author: {
      name: comment.author?.name ?? 'Codeqlick',
      // A deleted author was most likely a team member: clients are deactivated, not deleted.
      team: comment.author ? comment.author.role === Role.ADMIN : true,
    },
  };
}

function toUpdateView(update: UpdateWithAuthor): ProjectUpdateView {
  return {
    id: update.id,
    title: update.title,
    body: update.body,
    createdAt: update.createdAt.toISOString(),
    author: { name: update.author?.name ?? 'Codeqlick' },
    approvalRequested: update.approvalRequested,
    approvedAt: update.approvedAt?.toISOString() ?? null,
    approvedBy: update.approvedAt ? { name: update.approvedBy?.name ?? '—' } : null,
    comments: update.comments.map(toCommentView),
  };
}

function toFileView(file: ProjectFile): ProjectFileView {
  return {
    id: file.id,
    name: file.name,
    contentType: file.contentType,
    size: file.size,
    createdAt: file.createdAt.toISOString(),
  };
}

function toMilestoneView(milestone: ProjectMilestone): ProjectMilestoneView {
  return {
    id: milestone.id,
    title: milestone.title,
    description: milestone.description,
    dueDate: milestone.dueDate?.toISOString() ?? null,
    completedAt: milestone.completedAt?.toISOString() ?? null,
  };
}

function toView(project: ProjectWithClient | ProjectWithUpdates): ClientProjectView {
  const view: ClientProjectView = {
    id: project.id,
    name: project.name,
    description: project.description,
    phase: project.phase,
    progress: project.progress,
    startDate: project.startDate?.toISOString() ?? null,
    dueDate: project.dueDate?.toISOString() ?? null,
    stagingUrl: project.stagingUrl,
    productionUrl: project.productionUrl,
    showHours: project.showHours,
    client: { id: project.client.id, name: project.client.name, email: project.client.email },
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
  if ('updates' in project) view.updates = project.updates.map(toUpdateView);
  if ('files' in project) view.files = project.files.map(toFileView);
  if ('milestones' in project) view.milestones = project.milestones.map(toMilestoneView);
  return view;
}

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly repository: ProjectsRepository,
    private readonly storage: ProjectFilesStorage,
    private readonly activity: ActivityService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  // ---- Portal (CLIENT, or ADMIN) ------------------------------------------------------

  async listForCaller(caller: AuthUser): Promise<ClientProjectView[]> {
    const projects = await this.repository.listByClient(caller.id);
    return projects.map(toView);
  }

  async getForCaller(caller: AuthUser, id: string): Promise<ClientProjectView> {
    return toView(await this.findForCallerOrThrow(caller, id));
  }

  async downloadFile(
    caller: AuthUser,
    projectId: string,
    fileId: string,
  ): Promise<ProjectFileDownload> {
    await this.findForCallerOrThrow(caller, projectId);
    const file = await this.repository.findFile(projectId, fileId);
    if (!file) throw new NotFoundException('File not found');
    return { stream: this.storage.read(file.id), name: file.name, size: file.size };
  }

  // ---- Admin --------------------------------------------------------------------------

  async list(query: ListProjectsQuery): Promise<Paginated<ClientProjectView>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const { items, total } = await this.repository.list(
      { clientId: query.clientId, phase: query.phase },
      skip,
      take,
    );
    return paginate(items.map(toView), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<ClientProjectView> {
    return toView(await this.findOrThrow(id));
  }

  async create(actor: AuthUser, input: CreateProjectInput): Promise<ClientProjectView> {
    await this.assertClient(input.clientId);
    const project = await this.repository.create({
      clientId: input.clientId,
      name: input.name,
      description: input.description ?? null,
      phase: input.phase,
      progress: input.progress,
      startDate: toDate(input.startDate) ?? null,
      dueDate: toDate(input.dueDate) ?? null,
      stagingUrl: input.stagingUrl ?? null,
      productionUrl: input.productionUrl ?? null,
      showHours: input.showHours ?? false,
    });
    await this.activity.record(actor, {
      action: 'project.created',
      targetId: project.id,
      targetLabel: project.name,
    });
    return toView(project);
  }

  async update(actor: AuthUser, id: string, input: UpdateProjectInput): Promise<ClientProjectView> {
    const existing = await this.findOrThrow(id);
    if (input.clientId !== undefined) await this.assertClient(input.clientId);

    const data: Prisma.ClientProjectUncheckedUpdateInput = {};
    if (input.clientId !== undefined) data.clientId = input.clientId;
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.phase !== undefined) data.phase = input.phase;
    if (input.progress !== undefined) data.progress = input.progress;
    if (input.startDate !== undefined) data.startDate = toDate(input.startDate);
    if (input.dueDate !== undefined) data.dueDate = toDate(input.dueDate);
    if (input.stagingUrl !== undefined) data.stagingUrl = input.stagingUrl;
    if (input.productionUrl !== undefined) data.productionUrl = input.productionUrl;
    if (input.showHours !== undefined) data.showHours = input.showHours;

    const project = await this.repository.update(id, data);
    // The client sees phase and progress first: worth spelling out when they move.
    const details: Record<string, unknown> = {};
    if (input.phase !== undefined && input.phase !== existing.phase) details.phase = input.phase;
    if (input.progress !== undefined && input.progress !== existing.progress) {
      details.progress = input.progress;
    }
    await this.activity.record(actor, {
      action: 'project.updated',
      targetId: id,
      targetLabel: project.name,
      details: Object.keys(details).length > 0 ? details : undefined,
    });
    return toView(project);
  }

  async delete(actor: AuthUser, id: string): Promise<void> {
    const project = await this.findOrThrow(id);
    await this.repository.delete(id);
    // The rows went with the project (cascade); the content goes once they are gone.
    await Promise.all(project.files.map((file) => this.storage.remove(file.id)));
    await this.activity.record(actor, {
      action: 'project.deleted',
      targetId: id,
      targetLabel: project.name,
    });
  }

  async addFile(
    uploader: AuthUser,
    projectId: string,
    upload: UploadedProjectFile | undefined,
  ): Promise<ProjectFileView> {
    if (!upload || upload.buffer.length === 0) {
      throw new BadRequestException('Send the file in a multipart field called "file"');
    }
    const project = await this.findOrThrow(projectId);

    const id = randomUUID();
    await this.storage.write(id, upload.buffer);
    try {
      const file = await this.repository.addFile({
        id,
        projectId,
        uploadedById: uploader.id,
        name: cleanFileName(upload.originalname),
        contentType: cleanContentType(upload.mimetype),
        size: upload.buffer.length,
      });
      await this.activity.record(uploader, {
        action: 'project.file_uploaded',
        targetId: projectId,
        targetLabel: project.name,
        details: { file: file.name },
      });
      return toFileView(file);
    } catch (error) {
      await this.storage.remove(id);
      throw error;
    }
  }

  async deleteFile(actor: AuthUser, projectId: string, fileId: string): Promise<void> {
    const project = await this.findOrThrow(projectId);
    const file = await this.repository.findFile(projectId, fileId);
    if (!file) throw new NotFoundException('File not found');
    await this.repository.deleteFile(file.id);
    await this.storage.remove(file.id);
    await this.activity.record(actor, {
      action: 'project.file_deleted',
      targetId: projectId,
      targetLabel: project.name,
      details: { file: file.name },
    });
  }

  async addMilestone(
    actor: AuthUser,
    projectId: string,
    input: CreateMilestoneInput,
  ): Promise<ProjectMilestoneView> {
    const project = await this.findOrThrow(projectId);
    const milestone = await this.repository.addMilestone({
      projectId,
      title: input.title,
      description: input.description || null,
      dueDate: toDate(input.dueDate) ?? null,
    });
    await this.activity.record(actor, {
      action: 'project.milestone_added',
      targetId: projectId,
      targetLabel: project.name,
      details: { milestone: milestone.title },
    });
    return toMilestoneView(milestone);
  }

  async updateMilestone(
    actor: AuthUser,
    projectId: string,
    milestoneId: string,
    input: UpdateMilestoneInput,
  ): Promise<ProjectMilestoneView> {
    const project = await this.findOrThrow(projectId);
    const existing = await this.repository.findMilestone(projectId, milestoneId);
    if (!existing) throw new NotFoundException('Milestone not found');

    const data: Prisma.ProjectMilestoneUncheckedUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description || null;
    if (input.dueDate !== undefined) data.dueDate = toDate(input.dueDate);
    if (input.completed !== undefined) {
      data.completedAt = input.completed ? (existing.completedAt ?? new Date()) : null;
    }
    const milestone = await this.repository.updateMilestone(milestoneId, data);

    // Ticking a milestone off is what the client cares about; other edits are housekeeping.
    const completedNow = !existing.completedAt && milestone.completedAt;
    await this.activity.record(actor, {
      action: completedNow ? 'project.milestone_completed' : 'project.milestone_updated',
      targetId: projectId,
      targetLabel: project.name,
      details: { milestone: milestone.title },
    });
    return toMilestoneView(milestone);
  }

  async deleteMilestone(actor: AuthUser, projectId: string, milestoneId: string): Promise<void> {
    const project = await this.findOrThrow(projectId);
    const milestone = await this.repository.findMilestone(projectId, milestoneId);
    if (!milestone) throw new NotFoundException('Milestone not found');
    await this.repository.deleteMilestone(milestone.id);
    await this.activity.record(actor, {
      action: 'project.milestone_deleted',
      targetId: projectId,
      targetLabel: project.name,
      details: { milestone: milestone.title },
    });
  }

  async reorderMilestones(
    projectId: string,
    input: ReorderMilestonesInput,
  ): Promise<ProjectMilestoneView[]> {
    const project = await this.findOrThrow(projectId);
    const current = new Set(project.milestones.map((milestone) => milestone.id));
    if (input.ids.length !== current.size || input.ids.some((id) => !current.has(id))) {
      throw new BadRequestException('ids must list every milestone of the project once');
    }
    const milestones = await this.repository.reorderMilestones(projectId, input.ids);
    return milestones.map(toMilestoneView);
  }

  /**
   * Posts an update. With `notifyClient`, the client is emailed it in their language;
   * `clientNotified` then says whether that worked (a failed email keeps the update).
   */
  async addUpdate(
    author: AuthUser,
    projectId: string,
    input: CreateProjectUpdateInput,
  ): Promise<PostedProjectUpdate> {
    const project = await this.findOrThrow(projectId);
    const update = await this.repository.addUpdate(
      projectId,
      author.id,
      input.title,
      input.body,
      input.requestApproval,
    );
    const view = toUpdateView(update);
    const clientNotified = input.notifyClient
      ? await this.notifyClient(project, {
          ...input,
          approvalRequested: input.requestApproval,
        }).then(
          () => true,
          (error: unknown) => {
            const reason = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to email the project update: ${reason}`);
            return false;
          },
        )
      : undefined;
    await this.activity.record(author, {
      action: 'project.update_posted',
      targetId: projectId,
      targetLabel: project.name,
      details: {
        title: input.title,
        ...(input.requestApproval && { approvalRequested: true }),
        ...(clientNotified !== undefined && { clientNotified }),
      },
    });
    return clientNotified === undefined ? view : { ...view, clientNotified };
  }

  // ---- Comments and approvals ----------------------------------------------------------

  /** A comment from the portal: the project's client (or an admin looking at the portal). */
  async addClientComment(
    caller: AuthUser,
    projectId: string,
    updateId: string,
    input: CreateUpdateCommentInput,
  ): Promise<UpdateCommentView> {
    const project = await this.findForCallerOrThrow(caller, projectId);
    const update = await this.findUpdateOrThrow(projectId, updateId);
    const comment = await this.repository.addComment(projectId, updateId, caller.id, input.body);
    if (caller.role === 'CLIENT') {
      this.notifyTeam(project, update, { kind: 'comment', body: input.body });
    }
    await this.activity.record(caller, {
      action: 'project.comment_added',
      targetId: projectId,
      targetLabel: project.name,
      details: { title: update.title },
    });
    return toCommentView(comment);
  }

  /** A comment from the admin panel; the client is emailed it in their language. */
  async addTeamComment(
    author: AuthUser,
    projectId: string,
    updateId: string,
    input: CreateUpdateCommentInput,
  ): Promise<PostedTeamComment> {
    const project = await this.findOrThrow(projectId);
    const update = await this.findUpdateOrThrow(projectId, updateId);
    const comment = await this.repository.addComment(projectId, updateId, author.id, input.body);
    const view = toCommentView(comment);
    const clientNotified = await this.emailClient(project, (link, locale) =>
      teamCommentEmail(
        project.client,
        project,
        update,
        { body: input.body, authorName: view.author.name },
        `${link}#update-${updateId}`,
        locale,
        this.config.siteUrl,
      ),
    );
    await this.activity.record(author, {
      action: 'project.comment_added',
      targetId: projectId,
      targetLabel: project.name,
      details: { title: update.title, clientNotified },
    });
    return { ...view, clientNotified };
  }

  /** The project's client approves an update the team asked them to approve. */
  async approveUpdate(
    caller: AuthUser,
    projectId: string,
    updateId: string,
  ): Promise<ProjectUpdateView> {
    // Approving is the client's call: admins can see the portal but not sign off for them.
    if (caller.role !== 'CLIENT') throw new ForbiddenException('Only the client can approve');
    const project = await this.findForCallerOrThrow(caller, projectId);
    const update = await this.findUpdateOrThrow(projectId, updateId);
    if (!update.approvalRequested) {
      throw new BadRequestException("This update doesn't need an approval");
    }
    if (update.approvedAt) return toUpdateView(update);

    const approved = await this.repository.approveUpdate(updateId, caller.id);
    this.notifyTeam(project, update, { kind: 'approval' });
    await this.activity.record(caller, {
      action: 'project.update_approved',
      targetId: projectId,
      targetLabel: project.name,
      details: { title: update.title },
    });
    return toUpdateView(approved);
  }

  /** Fire-and-forget email to the team inbox; mail problems are logged, never thrown. */
  private notifyTeam(
    project: ProjectWithClient,
    update: { id: string; title: string },
    event: { kind: 'comment'; body: string } | { kind: 'approval' },
  ): void {
    const link = `${this.config.siteUrl}/es/admin/projects/${project.id}#update-${update.id}`;
    const message = clientActivityEmail(
      this.config.leadsNotifyTo,
      project.client,
      project,
      update,
      event,
      link,
      this.config.siteUrl,
    );
    this.mail.send(message).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to email the team about a client ${event.kind}: ${reason}`);
    });
  }

  /** Emails the client (built with their portal link and language); false when it failed. */
  private async emailClient(
    project: ProjectWithClient,
    build: (link: string, locale: ApiLocale) => MailMessage,
  ): Promise<boolean> {
    try {
      if (!project.client.isActive) throw new Error('the client account is deactivated');
      const locale = toApiLocale(project.client.locale);
      const link = `${this.config.siteUrl}/${locale}/portal/projects/${project.id}`;
      await this.mail.send(build(link, locale));
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to email the client: ${reason}`);
      return false;
    }
  }

  private async findUpdateOrThrow(projectId: string, updateId: string): Promise<UpdateWithAuthor> {
    const update = await this.repository.findUpdate(projectId, updateId);
    if (!update) throw new NotFoundException('Update not found');
    return update;
  }

  private async notifyClient(
    project: ProjectWithClient,
    update: { title: string; body: string; approvalRequested?: boolean },
  ): Promise<void> {
    // A deactivated client can't sign in to read it.
    if (!project.client.isActive) throw new Error('the client account is deactivated');
    const locale = toApiLocale(project.client.locale);
    const link = `${this.config.siteUrl}/${locale}/portal/projects/${project.id}`;
    await this.mail.send(
      projectUpdateEmail(project.client, project, update, link, locale, this.config.siteUrl),
    );
  }

  private async findForCallerOrThrow(caller: AuthUser, id: string): Promise<ProjectWithUpdates> {
    const project = await this.repository.findById(id);
    // Clients only see their own projects; admins may look at any project.
    if (!project || (caller.role !== 'ADMIN' && project.clientId !== caller.id)) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  private async findOrThrow(id: string): Promise<ProjectWithUpdates> {
    const project = await this.repository.findById(id);
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async assertClient(clientId: string): Promise<void> {
    const user = await this.repository.findUserById(clientId);
    if (!user || user.role !== Role.CLIENT) {
      throw new BadRequestException('clientId must reference an existing CLIENT user');
    }
  }
}
