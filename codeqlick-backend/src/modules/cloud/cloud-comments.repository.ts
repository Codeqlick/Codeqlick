import { Injectable } from '@nestjs/common';
import type { CloudComment, CloudCommentThread, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { THREADS_LISTED } from './cloud-comments.js';

export type ThreadWithComments = CloudCommentThread & { comments: CloudComment[] };

const withComments = {
  comments: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
} satisfies Prisma.CloudCommentThreadInclude;

/** Preview comments (architecture 4.13 "Preview comments", decision 111). */
@Injectable()
export class CloudCommentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  threads(where: Prisma.CloudCommentThreadWhereInput): Promise<ThreadWithComments[]> {
    return this.prisma.cloudCommentThread.findMany({
      where,
      include: withComments,
      orderBy: [{ lastCommentAt: 'desc' }, { id: 'desc' }],
      take: THREADS_LISTED,
    });
  }

  countOpen(projectId: string): Promise<number> {
    return this.prisma.cloudCommentThread.count({ where: { projectId, resolvedAt: null } });
  }

  countThreads(projectId: string): Promise<number> {
    return this.prisma.cloudCommentThread.count({ where: { projectId } });
  }

  thread(projectId: string, id: string): Promise<ThreadWithComments | null> {
    return this.prisma.cloudCommentThread.findFirst({
      where: { id, projectId },
      include: withComments,
    });
  }

  createThread(
    data: Prisma.CloudCommentThreadUncheckedCreateInput,
    comment: Omit<Prisma.CloudCommentUncheckedCreateInput, 'threadId'>,
  ): Promise<ThreadWithComments> {
    return this.prisma.cloudCommentThread.create({
      data: { ...data, comments: { create: comment } },
      include: withComments,
    });
  }

  /** A reply, and the thread's last activity, together. */
  async addComment(
    threadId: string,
    comment: Omit<Prisma.CloudCommentUncheckedCreateInput, 'threadId'>,
  ): Promise<CloudComment> {
    const [created] = await this.prisma.$transaction([
      this.prisma.cloudComment.create({ data: { ...comment, threadId } }),
      this.prisma.cloudCommentThread.update({
        where: { id: threadId },
        data: { lastCommentAt: new Date() },
      }),
    ]);
    return created;
  }

  resolve(
    id: string,
    resolved: { at: Date; byId: string; byName: string } | null,
  ): Promise<ThreadWithComments> {
    return this.prisma.cloudCommentThread.update({
      where: { id },
      data: resolved
        ? { resolvedAt: resolved.at, resolvedById: resolved.byId, resolvedByName: resolved.byName }
        : { resolvedAt: null, resolvedById: null, resolvedByName: null },
      include: withComments,
    });
  }

  /** Deletes a comment; the thread goes with its last one. True when the thread went too. */
  async deleteComment(threadId: string, commentId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.cloudComment.delete({ where: { id: commentId } });
      if ((await tx.cloudComment.count({ where: { threadId } })) > 0) return false;
      await tx.cloudCommentThread.delete({ where: { id: threadId } });
      return true;
    });
  }

  /** The team's members who can still sign in (mentions and the overlay's picker). */
  members(teamId: string) {
    return this.prisma.cloudMember
      .findMany({
        where: { teamId, user: { isActive: true } },
        include: { user: { select: { id: true, name: true, email: true, locale: true } } },
        orderBy: { createdAt: 'asc' },
      })
      .then((rows) => rows.map((row) => row.user));
  }

  /** Names of people, for mentions shown in views. */
  names(ids: string[]): Promise<Array<{ id: string; name: string }>> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
  }

  activeUser(id: string) {
    return this.prisma.user.findFirst({
      where: { id, isActive: true, registeredAt: { not: null } },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  deployment(projectId: string, id: string) {
    return this.prisma.cloudDeployment.findFirst({
      where: { id, projectId },
      select: { id: true, shortId: true },
    });
  }
}
