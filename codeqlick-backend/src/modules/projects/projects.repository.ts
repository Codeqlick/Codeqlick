import { Injectable } from '@nestjs/common';
import type {
  ClientProject,
  Prisma,
  ProjectPhase,
  ProjectFile,
  ProjectMilestone,
  ProjectUpdate,
  ProjectUpdateComment,
  ReleaseEnvironment,
  UpdateDraft,
  User,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

type ClientRef = Pick<User, 'id' | 'name' | 'email' | 'locale' | 'isActive' | 'memberOfId'>;
export type CommentWithAuthor = ProjectUpdateComment & {
  author: Pick<User, 'name' | 'role'> | null;
};
export type UpdateWithAuthor = ProjectUpdate & {
  author: Pick<User, 'name'> | null;
  approvedBy: Pick<User, 'name'> | null;
  comments: CommentWithAuthor[];
};

export type DraftWithProject = UpdateDraft & { project: { id: string; name: string } };
export type ProjectWithClient = ClientProject & { client: ClientRef };
export type ProjectWithUpdates = ProjectWithClient & {
  updates: UpdateWithAuthor[];
  files: ProjectFile[];
  milestones: ProjectMilestone[];
};

const clientSelect = {
  // memberOfId: people of a client company see its account's projects (weekly summary included).
  select: { id: true, name: true, email: true, locale: true, isActive: true, memberOfId: true },
} as const;
const commentInclude = { author: { select: { name: true, role: true } } } as const;
const updateInclude = {
  author: { select: { name: true } },
  approvedBy: { select: { name: true } },
  comments: { orderBy: { createdAt: 'asc' }, include: commentInclude },
} as const;
const updatesInclude = { orderBy: { createdAt: 'desc' }, include: updateInclude } as const;
const filesInclude = { orderBy: { createdAt: 'desc' } } as const;
const milestonesInclude = { orderBy: { position: 'asc' } } as const;
const detailInclude = {
  client: clientSelect,
  updates: updatesInclude,
  files: filesInclude,
  milestones: milestonesInclude,
};

export interface ProjectFilter {
  clientId?: string;
  phase?: ProjectPhase;
}

@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async list(
    filter: ProjectFilter,
    skip: number,
    take: number,
  ): Promise<{ items: ProjectWithClient[]; total: number }> {
    const where: Prisma.ClientProjectWhereInput = {};
    if (filter.clientId) where.clientId = filter.clientId;
    if (filter.phase) where.phase = filter.phase;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.clientProject.findMany({
        where,
        include: { client: clientSelect },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.clientProject.count({ where }),
    ]);
    return { items, total };
  }

  listByClient(clientId: string): Promise<ProjectWithClient[]> {
    return this.prisma.clientProject.findMany({
      where: { clientId },
      include: { client: clientSelect },
      orderBy: { updatedAt: 'desc' },
    });
  }

  findById(id: string): Promise<ProjectWithUpdates | null> {
    return this.prisma.clientProject.findUnique({
      where: { id },
      include: detailInclude,
    });
  }

  create(data: Prisma.ClientProjectUncheckedCreateInput): Promise<ProjectWithUpdates> {
    return this.prisma.clientProject.create({
      data,
      include: detailInclude,
    });
  }

  update(id: string, data: Prisma.ClientProjectUncheckedUpdateInput): Promise<ProjectWithUpdates> {
    return this.prisma.clientProject.update({
      where: { id },
      data,
      include: detailInclude,
    });
  }

  /** The slug of the project's managed site, if it has one. */
  async siteSlugOf(projectId: string): Promise<string | null> {
    const site = await this.prisma.managedSite.findUnique({
      where: { projectId },
      select: { slug: true },
    });
    return site?.slug ?? null;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.clientProject.delete({ where: { id } });
  }

  findFile(projectId: string, fileId: string): Promise<ProjectFile | null> {
    return this.prisma.projectFile.findFirst({ where: { id: fileId, projectId } });
  }

  /** Records an uploaded file and bumps the project's updatedAt. */
  async addFile(data: Prisma.ProjectFileUncheckedCreateInput): Promise<ProjectFile> {
    return this.prisma.$transaction(async (tx) => {
      const file = await tx.projectFile.create({ data });
      await tx.clientProject.update({
        where: { id: data.projectId },
        data: { updatedAt: new Date() },
      });
      return file;
    });
  }

  async deleteFile(id: string): Promise<void> {
    await this.prisma.projectFile.delete({ where: { id } });
  }

  /** Adds a progress update and bumps the project's updatedAt. */
  /**
   * Posts an update (a release when `release` is given) and bumps the project's updatedAt; a
   * release with a URL also becomes the project's staging or production address.
   */
  async addUpdate(
    projectId: string,
    authorId: string | null,
    title: string,
    body: string,
    approvalRequested: boolean,
    release?: { version: string; environment: ReleaseEnvironment; url: string | null },
  ): Promise<UpdateWithAuthor> {
    return this.prisma.$transaction(async (tx) => {
      const update = await tx.projectUpdate.create({
        data: { projectId, authorId, title, body, approvalRequested, ...release },
        include: updateInclude,
      });
      const project: Prisma.ClientProjectUpdateInput = { updatedAt: new Date() };
      if (release?.url) {
        if (release.environment === 'PRODUCTION') project.productionUrl = release.url;
        else project.stagingUrl = release.url;
      }
      await tx.clientProject.update({ where: { id: projectId }, data: project });
      return update;
    });
  }

  findByReleaseTokenHash(hash: string): Promise<ProjectWithUpdates | null> {
    return this.prisma.clientProject.findUnique({
      where: { releaseTokenHash: hash },
      include: detailInclude,
    });
  }

  async setReleaseToken(id: string, hash: string | null): Promise<void> {
    await this.prisma.clientProject.update({
      where: { id },
      data: { releaseTokenHash: hash, releaseTokenCreatedAt: hash ? new Date() : null },
    });
  }

  findMilestone(projectId: string, milestoneId: string): Promise<ProjectMilestone | null> {
    return this.prisma.projectMilestone.findFirst({ where: { id: milestoneId, projectId } });
  }

  /** Appends a milestone after the last one and bumps the project's updatedAt. */
  async addMilestone(
    data: Omit<Prisma.ProjectMilestoneUncheckedCreateInput, 'position'>,
  ): Promise<ProjectMilestone> {
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.projectMilestone.findFirst({
        where: { projectId: data.projectId },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const milestone = await tx.projectMilestone.create({
        data: { ...data, position: (last?.position ?? -1) + 1 },
      });
      await tx.clientProject.update({
        where: { id: data.projectId },
        data: { updatedAt: new Date() },
      });
      return milestone;
    });
  }

  async updateMilestone(
    id: string,
    data: Prisma.ProjectMilestoneUncheckedUpdateInput,
  ): Promise<ProjectMilestone> {
    return this.prisma.$transaction(async (tx) => {
      const milestone = await tx.projectMilestone.update({ where: { id }, data });
      await tx.clientProject.update({
        where: { id: milestone.projectId },
        data: { updatedAt: new Date() },
      });
      return milestone;
    });
  }

  async deleteMilestone(id: string): Promise<void> {
    await this.prisma.projectMilestone.delete({ where: { id } });
  }

  /** Gives each milestone its index in `ids` as its position. */
  async reorderMilestones(projectId: string, ids: string[]): Promise<ProjectMilestone[]> {
    return this.prisma.$transaction(async (tx) => {
      for (const [position, id] of ids.entries()) {
        await tx.projectMilestone.update({ where: { id, projectId }, data: { position } });
      }
      return tx.projectMilestone.findMany({ where: { projectId }, orderBy: { position: 'asc' } });
    });
  }

  findUpdate(projectId: string, updateId: string): Promise<UpdateWithAuthor | null> {
    return this.prisma.projectUpdate.findFirst({
      where: { id: updateId, projectId },
      include: updateInclude,
    });
  }

  /** Adds a comment to an update and bumps the project's updatedAt. */
  async addComment(
    projectId: string,
    updateId: string,
    authorId: string,
    body: string,
  ): Promise<CommentWithAuthor> {
    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.projectUpdateComment.create({
        data: { updateId, authorId, body },
        include: commentInclude,
      });
      await tx.clientProject.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
      return comment;
    });
  }

  /** Records the approval; an update approved already keeps its first approval. */
  async approveUpdate(updateId: string, userId: string): Promise<UpdateWithAuthor> {
    await this.prisma.projectUpdate.updateMany({
      where: { id: updateId, approvedAt: null },
      data: { approvedAt: new Date(), approvedById: userId },
    });
    return this.prisma.projectUpdate.findUniqueOrThrow({
      where: { id: updateId },
      include: updateInclude,
    });
  }

  createDraft(data: Prisma.UpdateDraftUncheckedCreateInput): Promise<UpdateDraft> {
    return this.prisma.updateDraft.create({ data });
  }

  /** Drafts waiting for review, oldest first; all projects' when `projectId` is left out. */
  listDrafts(projectId?: string): Promise<DraftWithProject[]> {
    return this.prisma.updateDraft.findMany({
      where: projectId ? { projectId } : {},
      orderBy: { createdAt: 'asc' },
      include: { project: { select: { id: true, name: true } } },
    });
  }

  findDraft(projectId: string, draftId: string): Promise<UpdateDraft | null> {
    return this.prisma.updateDraft.findFirst({ where: { id: draftId, projectId } });
  }

  async deleteDraft(id: string): Promise<void> {
    await this.prisma.updateDraft.delete({ where: { id } });
  }

  /** Active clients who want the summary and haven't had this week's one. */
  listDigestRecipients(weekStart: Date): Promise<ClientRef[]> {
    return this.prisma.user.findMany({
      where: {
        role: 'CLIENT',
        isActive: true,
        weeklyDigest: true,
        // Not someone who hasn't made the account theirs yet (decision 17).
        registeredAt: { not: null },
        OR: [{ lastDigestAt: null }, { lastDigestAt: { lt: weekStart } }],
      },
      select: clientSelect.select,
    });
  }

  findClient(id: string): Promise<(ClientRef & { role: string }) | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { ...clientSelect.select, role: true },
    });
  }

  /** A client's projects with what the summary needs: activity since `since`, and what's open. */
  projectsForDigest(clientId: string, since: Date) {
    return this.prisma.clientProject.findMany({
      where: { clientId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        phase: true,
        progress: true,
        updates: {
          where: {
            OR: [{ createdAt: { gte: since } }, { approvalRequested: true, approvedAt: null }],
          },
          orderBy: { createdAt: 'asc' },
          select: { title: true, createdAt: true, approvalRequested: true, approvedAt: true },
        },
        milestones: {
          orderBy: { position: 'asc' },
          select: { title: true, dueDate: true, completedAt: true },
        },
      },
    });
  }

  async markDigestSent(userId: string, at: Date): Promise<void> {
    await this.prisma.user.update({ where: { id: userId }, data: { lastDigestAt: at } });
  }
}
