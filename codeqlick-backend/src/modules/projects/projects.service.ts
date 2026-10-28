import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import type { ApiLocale } from '../../common/schemas/common.schemas.js';
import { accountOf, type AuthUser } from '../../common/types/auth-user.js';
import { AppConfigService } from '../../config/app-config.service.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import {
  Role,
  type Prisma,
  type ProjectFile,
  type ProjectMilestone,
  type ProjectPhase,
  type ReleaseEnvironment,
} from '../../generated/prisma/client.js';
import {
  ProjectsRepository,
  type CommentWithAuthor,
  type DraftWithProject,
  type ProjectWithClient,
  type ProjectWithUpdates,
  type UpdateWithAuthor,
} from './projects.repository.js';
import { SiteBuilderClient } from '../managed-sites/site-builder.client.js';
import { AccountsService, type AccountPerson } from '../accounts/accounts.service.js';
import { ReviewsService } from '../reviews/reviews.service.js';
import { ActivityService, type ActivityActor } from '../activity/activity.service.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import {
  clientActivityEmail,
  draftReadyEmail,
  projectUpdateEmail,
  teamCommentEmail,
} from './project-emails.js';
import { cleanContentType, cleanFileName } from './project-file-name.js';
import { hashKey } from './release-key.js';
import { ProjectFilesStorage } from './project-files.storage.js';
import type {
  CreateMilestoneInput,
  CreateProjectInput,
  CreateProjectUpdateInput,
  CreateDraftInput,
  CreateReleaseInput,
  CreateUpdateCommentInput,
  ListProjectsQuery,
  PublishDraftInput,
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
  /** Set on releases: the version, where it went and its address. */
  release: { version: string; environment: 'STAGING' | 'PRODUCTION'; url: string | null } | null;
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
  /** When the current release key was made; null without one. */
  releaseKeyCreatedAt: string | null;
  /** The watched domain and its expiry (`yyyy-mm-dd`), if known. */
  domainName: string | null;
  domainExpiresAt: string | null;
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
    release:
      update.version && update.environment
        ? { version: update.version, environment: update.environment, url: update.url }
        : null,
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
    releaseKeyCreatedAt: project.releaseTokenCreatedAt?.toISOString() ?? null,
    domainName: project.domainName,
    domainExpiresAt: project.domainExpiresAt?.toISOString().slice(0, 10) ?? null,
    client: { id: project.client.id, name: project.client.name, email: project.client.email },
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
  if ('updates' in project) view.updates = project.updates.map(toUpdateView);
  if ('files' in project) view.files = project.files.map(toFileView);
  if ('milestones' in project) view.milestones = project.milestones.map(toMilestoneView);
  return view;
}

/** Who acts when a request comes with a release key instead of a session. */
const PIPELINE = { id: null, name: 'Despliegue automático' } as const;

export interface UpdateDraftView {
  id: string;
  project: { id: string; name: string };
  title: string;
  body: string;
  version: string | null;
  environment: 'STAGING' | 'PRODUCTION' | null;
  url: string | null;
  createdAt: string;
}

function toDraftView(draft: DraftWithProject): UpdateDraftView {
  return {
    id: draft.id,
    project: draft.project,
    title: draft.title,
    body: draft.body,
    version: draft.version,
    environment: draft.environment,
    url: draft.url,
    createdAt: draft.createdAt.toISOString(),
  };
}

function releaseOf(input: CreateReleaseInput) {
  return { version: input.version, environment: input.environment, url: input.url ?? null };
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
    private readonly accounts: AccountsService,
    private readonly reviews: ReviewsService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly builder: SiteBuilderClient,
  ) {}

  // ---- Portal (CLIENT, or ADMIN) ------------------------------------------------------

  async listForCaller(caller: AuthUser): Promise<ClientProjectView[]> {
    const projects = await this.repository.listByClient(accountOf(caller));
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
    // Launched: time to ask the client how it went (once per project).
    if (details.phase === 'LAUNCHED') await this.reviews.request(actor, id);
    return toView(project);
  }

  async delete(actor: AuthUser, id: string): Promise<void> {
    const project = await this.findOrThrow(id);
    // Its managed site is taken down first (architecture 8.2): the row goes with the project.
    const slug = await this.repository.siteSlugOf(id);
    if (slug) await this.builder.remove(slug);
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
    return this.post(author, await this.findOrThrow(projectId), input);
  }

  /** A release from the admin panel. */
  async addRelease(
    author: AuthUser,
    projectId: string,
    input: CreateReleaseInput,
  ): Promise<PostedProjectUpdate> {
    return this.post(author, await this.findOrThrow(projectId), input, releaseOf(input));
  }

  /**
   * A release from a deploy pipeline, authenticated by the project's release key (no user). 401
   * for an unknown key, so a wrong one says nothing about which projects exist.
   */
  async publishWithKey(key: string, input: CreateReleaseInput): Promise<PostedProjectUpdate> {
    const project = key ? await this.repository.findByReleaseTokenHash(hashKey(key)) : null;
    if (!project) throw new UnauthorizedException('Unknown release key');
    return this.post(PIPELINE, project, input, releaseOf(input));
  }

  /**
   * A draft sent with the project's release key: stored for review and the team is emailed.
   * Nothing reaches the client until it is published.
   */
  async receiveDraft(key: string, input: CreateDraftInput): Promise<UpdateDraftView> {
    const project = key ? await this.repository.findByReleaseTokenHash(hashKey(key)) : null;
    if (!project) throw new UnauthorizedException('Unknown release key');
    const draft = await this.repository.createDraft({
      projectId: project.id,
      title: input.title,
      body: input.body,
      version: input.version ?? null,
      environment: input.version ? (input.environment ?? null) : null,
      url: input.url ?? null,
    });
    this.mail
      .send(
        draftReadyEmail(
          this.config.leadsNotifyTo,
          project,
          draft,
          `${this.config.siteUrl}/es/admin/projects/${project.id}#drafts`,
          this.config.siteUrl,
        ),
      )
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to email the team about a draft: ${reason}`);
      });
    await this.activity.record(PIPELINE, {
      action: 'project.draft_received',
      targetId: project.id,
      targetLabel: project.name,
      details: { title: draft.title },
    });
    return toDraftView({ ...draft, project: { id: project.id, name: project.name } });
  }

  /** Drafts waiting for review: one project's, or every project's. */
  async listDrafts(projectId?: string): Promise<UpdateDraftView[]> {
    if (projectId) await this.findOrThrow(projectId);
    return (await this.repository.listDrafts(projectId)).map(toDraftView);
  }

  /** Publishes a draft as reviewed (an update, or a release with a version) and removes it. */
  async publishDraft(
    author: AuthUser,
    projectId: string,
    draftId: string,
    input: PublishDraftInput,
  ): Promise<PostedProjectUpdate> {
    const project = await this.findOrThrow(projectId);
    const draft = await this.repository.findDraft(projectId, draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    const release =
      input.version && input.environment
        ? { version: input.version, environment: input.environment, url: input.url ?? null }
        : undefined;
    const posted = await this.post(author, project, input, release);
    await this.repository.deleteDraft(draft.id);
    return posted;
  }

  async discardDraft(author: AuthUser, projectId: string, draftId: string): Promise<void> {
    const project = await this.findOrThrow(projectId);
    const draft = await this.repository.findDraft(projectId, draftId);
    if (!draft) throw new NotFoundException('Draft not found');
    await this.repository.deleteDraft(draft.id);
    await this.activity.record(author, {
      action: 'project.draft_discarded',
      targetId: projectId,
      targetLabel: project.name,
      details: { title: draft.title },
    });
  }

  /** A new release key for the project, replacing the previous one; shown only this once. */
  async createReleaseKey(actor: AuthUser, projectId: string): Promise<{ key: string }> {
    const project = await this.findOrThrow(projectId);
    const key = `cqr_${randomBytes(32).toString('base64url')}`;
    await this.repository.setReleaseToken(projectId, hashKey(key));
    await this.activity.record(actor, {
      action: 'project.release_key_created',
      targetId: projectId,
      targetLabel: project.name,
    });
    return { key };
  }

  async revokeReleaseKey(actor: AuthUser, projectId: string): Promise<void> {
    const project = await this.findOrThrow(projectId);
    await this.repository.setReleaseToken(projectId, null);
    await this.activity.record(actor, {
      action: 'project.release_key_revoked',
      targetId: projectId,
      targetLabel: project.name,
    });
  }

  private async post(
    author: ActivityActor,
    project: ProjectWithUpdates,
    input: CreateProjectUpdateInput,
    release?: { version: string; environment: ReleaseEnvironment; url: string | null },
  ): Promise<PostedProjectUpdate> {
    const projectId = project.id;
    const update = await this.repository.addUpdate(
      projectId,
      author.id,
      input.title,
      input.body,
      input.requestApproval,
      release,
    );
    const view = toUpdateView(update);
    const clientNotified = input.notifyClient
      ? await this.notifyClient(project, {
          ...input,
          approvalRequested: input.requestApproval,
          release,
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
      action: release ? 'project.release_published' : 'project.update_posted',
      targetId: projectId,
      targetLabel: project.name,
      details: {
        title: release ? `${release.version} · ${input.title}` : input.title,
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
      this.notifyTeam(caller, project, update, { kind: 'comment', body: input.body });
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
    const clientNotified = await this.emailClient(project, (person, link, locale) =>
      teamCommentEmail(
        person,
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
    this.notifyTeam(caller, project, update, { kind: 'approval' });
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
    person: { name: string; email: string },
    project: ProjectWithClient,
    update: { id: string; title: string },
    event: { kind: 'comment'; body: string } | { kind: 'approval' },
  ): void {
    const link = `${this.config.siteUrl}/es/admin/projects/${project.id}#update-${update.id}`;
    const message = clientActivityEmail(
      this.config.leadsNotifyTo,
      person,
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
  /**
   * Emails every active person of the client account (owner and members), each in their language;
   * true when at least one email went out.
   */
  private async emailClient(
    project: ProjectWithClient,
    build: (person: AccountPerson, link: string, locale: ApiLocale) => MailMessage,
  ): Promise<boolean> {
    const people = await this.accounts.people(project.clientId);
    const results = await Promise.allSettled(
      people.map((person) =>
        this.mail.send(
          build(
            person,
            `${this.config.siteUrl}/${person.locale}/portal/projects/${project.id}`,
            person.locale,
          ),
        ),
      ),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        const reason =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
        this.logger.error(`Failed to email the client: ${reason}`);
      }
    }
    return results.some((result) => result.status === 'fulfilled');
  }

  private async findUpdateOrThrow(projectId: string, updateId: string): Promise<UpdateWithAuthor> {
    const update = await this.repository.findUpdate(projectId, updateId);
    if (!update) throw new NotFoundException('Update not found');
    return update;
  }

  /** Emails an update to every person of the client account; throws when nobody got it. */
  private async notifyClient(
    project: ProjectWithClient,
    update: Parameters<typeof projectUpdateEmail>[2],
  ): Promise<void> {
    const sent = await this.emailClient(project, (person, link, locale) =>
      projectUpdateEmail(person, project, update, link, locale, this.config.siteUrl),
    );
    if (!sent) throw new Error('no active person of the client account could be emailed');
  }

  private async findForCallerOrThrow(caller: AuthUser, id: string): Promise<ProjectWithUpdates> {
    const project = await this.repository.findById(id);
    // Clients only see their own projects; admins may look at any project.
    if (!project || (caller.role !== 'ADMIN' && project.clientId !== accountOf(caller))) {
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
    // Projects belong to the company's account; its members see them through it.
    if (user.memberOfId) {
      throw new BadRequestException(
        'clientId must be the main client account, not one of its people',
      );
    }
  }
}
