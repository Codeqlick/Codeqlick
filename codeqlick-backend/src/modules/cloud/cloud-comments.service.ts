import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CloudComment, Locale } from '../../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { ROLE_RANK, type CloudCtx } from './cloud-caller.js';
import {
  COMMENT_TOKEN_TTL_SECONDS,
  COMMENTS_PER_THREAD,
  THREADS_PER_PROJECT,
  commentsAllowed,
  signCommentToken,
  threadLabel,
  verifyCommentToken,
} from './cloud-comments.js';
import { CloudCommentsRepository, type ThreadWithComments } from './cloud-comments.repository.js';
import { cloudCommentMentionEmail } from './cloud-emails.js';
import { CloudProjectsService } from './cloud-projects.service.js';
import { protectionKey } from './cloud-protection.js';
import { CloudProtectionService } from './cloud-protection.service.js';
import type { ProjectRow } from './cloud.repository.js';
import type { MembershipRow } from './cloud.repository.js';
import { CloudTeamsService } from './cloud-teams.service.js';
import type {
  CommentInput,
  CommentSessionInput,
  CommentsQuery,
  CreateThreadInput,
} from './cloud.schemas.js';

export interface CommentView {
  id: string;
  body: string;
  author: { id: string | null; name: string };
  mentions: Array<{ id: string; name: string }>;
  createdAt: string;
}

export interface ThreadView {
  id: string;
  deploymentId: string | null;
  deploymentShort: string;
  path: string;
  x: number;
  y: number;
  selector: string | null;
  viewportWidth: number | null;
  resolvedAt: string | null;
  resolvedBy: { id: string | null; name: string } | null;
  createdAt: string;
  lastCommentAt: string;
  comments: CommentView[];
}

/** What Nginx sends with `/__codeqlick/comments…` (deploy/nginx/cloud-protection.conf). */
export interface OverlayHeaders {
  key?: string;
  host?: string;
  kind?: string;
  token?: string;
}

/** Who calls the overlay's API, and on which deployment. */
interface OverlayAccess {
  ctx: CloudCtx;
  project: ProjectRow;
  membership: MembershipRow;
  deployment: { id: string; shortId: string };
}

const MINUTE_MS = 60_000;
/** Comments a minute per person. */
const COMMENTS_PER_MINUTE = 30;

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Preview comments (architecture 4.13 "Preview comments", decision 111). */
@Injectable()
export class CloudCommentsService {
  private readonly logger = new Logger(CloudCommentsService.name);
  private readonly key: Buffer;
  private readonly recent = new Map<string, number[]>();

  constructor(
    private readonly comments: CloudCommentsRepository,
    private readonly projects: CloudProjectsService,
    private readonly teams: CloudTeamsService,
    private readonly protection: CloudProtectionService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {
    this.key = protectionKey(config.credentialsSecret, 'cloud-comments-v1');
  }

  // ── Views ──────────────────────────────────────────────────────────────────────────────────

  private async views(threads: ThreadWithComments[]): Promise<ThreadView[]> {
    const ids = new Set<string>();
    for (const thread of threads) {
      for (const comment of thread.comments) for (const id of comment.mentionIds) ids.add(id);
    }
    const names = new Map((await this.comments.names([...ids])).map((u) => [u.id, u.name]));
    return threads.map((thread) => this.view(thread, names));
  }

  private view(thread: ThreadWithComments, names: Map<string, string>): ThreadView {
    return {
      id: thread.id,
      deploymentId: thread.deploymentId,
      deploymentShort: thread.deploymentShort,
      path: thread.path,
      x: thread.x,
      y: thread.y,
      selector: thread.selector,
      viewportWidth: thread.viewportWidth,
      resolvedAt: thread.resolvedAt?.toISOString() ?? null,
      resolvedBy: thread.resolvedAt
        ? { id: thread.resolvedById, name: thread.resolvedByName ?? '' }
        : null,
      createdAt: thread.createdAt.toISOString(),
      lastCommentAt: thread.lastCommentAt.toISOString(),
      comments: thread.comments.map((comment) => this.commentView(comment, names)),
    };
  }

  private commentView(comment: CloudComment, names: Map<string, string>): CommentView {
    return {
      id: comment.id,
      body: comment.body,
      author: { id: comment.authorId, name: comment.authorName },
      mentions: comment.mentionIds.map((id) => ({ id, name: names.get(id) ?? '' })),
      createdAt: comment.createdAt.toISOString(),
    };
  }

  private async oneView(thread: ThreadWithComments): Promise<ThreadView> {
    return (await this.views([thread]))[0]!;
  }

  // ── The console (session or API token) ─────────────────────────────────────────────────────

  async list(
    ctx: CloudCtx,
    projectId: string,
    query: CommentsQuery,
  ): Promise<{ open: number; items: ThreadView[] }> {
    const { project } = await this.projects.project(ctx, projectId);
    const threads = await this.comments.threads({
      projectId: project.id,
      ...(query.status === 'open' ? { resolvedAt: null } : {}),
      ...(query.status === 'resolved' ? { resolvedAt: { not: null } } : {}),
      ...(query.deploymentId ? { deploymentId: query.deploymentId } : {}),
      ...(query.path ? { path: query.path } : {}),
    });
    return { open: await this.comments.countOpen(project.id), items: await this.views(threads) };
  }

  async reply(
    ctx: CloudCtx,
    projectId: string,
    threadId: string,
    input: CommentInput,
  ): Promise<CommentView> {
    const { project, membership } = await this.projects.project(ctx, projectId);
    return this.addComment(ctx, project, membership, threadId, input);
  }

  async resolve(
    ctx: CloudCtx,
    projectId: string,
    threadId: string,
    resolved: boolean,
  ): Promise<ThreadView> {
    const { project, membership } = await this.projects.project(ctx, projectId);
    return this.setResolved(ctx, project, membership, threadId, resolved);
  }

  async removeComment(
    ctx: CloudCtx,
    projectId: string,
    threadId: string,
    commentId: string,
  ): Promise<void> {
    const { project, membership } = await this.projects.project(ctx, projectId);
    await this.deleteComment(ctx, project, membership, threadId, commentId);
  }

  /**
   * The link that opens a deployment's comments page with a 2-hour token in its fragment;
   * through the members' ticket when the previews are password-protected.
   */
  async session(
    ctx: CloudCtx,
    projectId: string,
    input: CommentSessionInput,
    now: number = Date.now(),
  ): Promise<{ url: string; expiresAt: string }> {
    const { project } = await this.projects.project(ctx, projectId);
    if (project.suspendedAt) throw new ForbiddenException('This project is suspended');
    const deployment = await this.comments.deployment(project.id, input.deploymentId);
    if (!deployment) throw new NotFoundException('Deployment not found');
    const host = new URL(this.projects.deploymentUrl(project.slug, deployment.shortId)).hostname;
    const expiresAt = Math.floor(now / 1000) + COMMENT_TOKEN_TTL_SECONDS;
    const token = signCommentToken(
      this.key,
      { userId: ctx.user.id, projectId: project.id, deploymentId: deployment.id, expiresAt },
      host,
    );
    const page = `/__codeqlick/comments?path=${encodeURIComponent(input.path)}`;
    const entry = await this.protection.ticket(ctx, project.id, host, now);
    const url = entry.url.includes('/__codeqlick/enter?')
      ? `${entry.url}&next=${encodeURIComponent(page)}`
      : `https://${host}${page}`;
    return {
      url: `${url}#token=${encodeURIComponent(token)}`,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  // ── The overlay (Nginx, on a deployment's address) ─────────────────────────────────────────

  /** 503 while protection isn't set up; 403 without Nginx's key; 404 anywhere but a preview. */
  assertPreview(headers: OverlayHeaders): void {
    const key = this.config.cloudProtectionKey;
    if (!key) throw new ServiceUnavailableException('Password protection is not set up yet');
    if (!headers.key || !timingSafeEqual(digest(headers.key), digest(key))) {
      throw new ForbiddenException('Not allowed');
    }
    if (!commentsAllowed(headers.kind, headers.host)) throw new NotFoundException('Not found');
  }

  private async overlay(
    headers: OverlayHeaders,
    ip: string | null,
    now: number = Date.now(),
  ): Promise<OverlayAccess> {
    this.assertPreview(headers);
    const host = headers.host?.trim().toLowerCase() ?? '';
    const expired = new UnauthorizedException(
      'This comments session has expired; open it again from the console',
    );
    const claim = verifyCommentToken(this.key, headers.token, host, now);
    if (!claim) throw expired;
    const user = await this.comments.activeUser(claim.userId);
    if (!user) throw expired;
    const project = await this.projects.projectRow(claim.projectId);
    if (!project) throw new NotFoundException('Project not found');
    if (project.suspendedAt) throw new ForbiddenException('This project is suspended');
    const deployment = await this.comments.deployment(project.id, claim.deploymentId);
    if (!deployment) throw new NotFoundException('Deployment not found');
    if (new URL(this.projects.deploymentUrl(project.slug, deployment.shortId)).hostname !== host) {
      throw expired;
    }
    const ctx: CloudCtx = {
      user: { id: user.id, email: user.email, name: user.name, role: user.role, via: 'session' },
      ip,
    };
    const membership = await this.teams.accessById(ctx, project.teamId);
    return { ctx, project, membership, deployment };
  }

  async overlayMe(headers: OverlayHeaders, ip: string | null) {
    const { ctx, project, membership, deployment } = await this.overlay(headers, ip);
    const claim = verifyCommentToken(this.key, headers.token, headers.host!.trim().toLowerCase());
    const locale = 'en';
    return {
      user: { id: ctx.user.id, name: ctx.user.name },
      admin: ROLE_RANK[membership.role] >= ROLE_RANK.ADMIN,
      project: { name: project.name, slug: project.slug },
      deployment: { id: deployment.id, shortId: deployment.shortId },
      members: (await this.comments.members(project.teamId)).map((m) => ({
        id: m.id,
        name: m.name,
      })),
      inboxUrl: this.inboxUrl(project, locale),
      expiresAt: new Date((claim?.expiresAt ?? 0) * 1000).toISOString(),
    };
  }

  async overlayThreads(headers: OverlayHeaders, ip: string | null) {
    const { project, deployment } = await this.overlay(headers, ip);
    const threads = await this.comments.threads({
      projectId: project.id,
      deploymentId: deployment.id,
    });
    return { open: threads.filter((t) => !t.resolvedAt).length, items: await this.views(threads) };
  }

  async overlayCreate(
    headers: OverlayHeaders,
    ip: string | null,
    input: CreateThreadInput,
  ): Promise<ThreadView> {
    const { ctx, project, membership, deployment } = await this.overlay(headers, ip);
    this.take(ctx.user.id);
    if ((await this.comments.countThreads(project.id)) >= THREADS_PER_PROJECT) {
      throw new ConflictException(`A project has at most ${THREADS_PER_PROJECT} comment threads`);
    }
    const mentions = await this.mentionable(project.teamId, ctx.user.id, input.mentions);
    const thread = await this.comments.createThread(
      {
        projectId: project.id,
        deploymentId: deployment.id,
        deploymentShort: deployment.shortId,
        path: input.path,
        x: input.x,
        y: input.y,
        selector: input.selector ?? null,
        viewportWidth: input.viewportWidth ?? null,
        createdById: ctx.user.id,
      },
      {
        authorId: ctx.user.id,
        authorName: (ctx.user.name || ctx.user.email).slice(0, 100),
        body: input.body,
        mentionIds: mentions.map((m) => m.id),
      },
    );
    await this.teams.record(
      ctx,
      membership.teamId,
      'comment.created',
      threadLabel(deployment.shortId, input.path),
      { threadId: thread.id, deploymentId: deployment.id, reply: false, mentions: mentions.length },
    );
    await this.tell(ctx, project, deployment.shortId, input.path, input.body, mentions);
    return this.oneView(thread);
  }

  async overlayReply(
    headers: OverlayHeaders,
    ip: string | null,
    threadId: string,
    input: CommentInput,
  ): Promise<CommentView> {
    const { ctx, project, membership, deployment } = await this.overlay(headers, ip);
    return this.addComment(ctx, project, membership, threadId, input, deployment.id);
  }

  async overlayResolve(
    headers: OverlayHeaders,
    ip: string | null,
    threadId: string,
    resolved: boolean,
  ): Promise<ThreadView> {
    const { ctx, project, membership, deployment } = await this.overlay(headers, ip);
    return this.setResolved(ctx, project, membership, threadId, resolved, deployment.id);
  }

  async overlayDelete(
    headers: OverlayHeaders,
    ip: string | null,
    threadId: string,
    commentId: string,
  ): Promise<void> {
    const { ctx, project, membership, deployment } = await this.overlay(headers, ip);
    await this.deleteComment(ctx, project, membership, threadId, commentId, deployment.id);
  }

  // ── Shared ─────────────────────────────────────────────────────────────────────────────────

  /** The thread of the project (and, from the overlay, of its deployment), or 404. */
  private async thread(
    projectId: string,
    threadId: string,
    deploymentId?: string,
  ): Promise<ThreadWithComments> {
    const thread = await this.comments.thread(projectId, threadId);
    if (!thread || (deploymentId && thread.deploymentId !== deploymentId)) {
      throw new NotFoundException('Comment thread not found');
    }
    return thread;
  }

  private async addComment(
    ctx: CloudCtx,
    project: ProjectRow,
    membership: MembershipRow,
    threadId: string,
    input: CommentInput,
    deploymentId?: string,
  ): Promise<CommentView> {
    const thread = await this.thread(project.id, threadId, deploymentId);
    this.take(ctx.user.id);
    if (thread.comments.length >= COMMENTS_PER_THREAD) {
      throw new ConflictException(`A thread has at most ${COMMENTS_PER_THREAD} comments`);
    }
    const mentions = await this.mentionable(project.teamId, ctx.user.id, input.mentions);
    const comment = await this.comments.addComment(thread.id, {
      authorId: ctx.user.id,
      authorName: (ctx.user.name || ctx.user.email).slice(0, 100),
      body: input.body,
      mentionIds: mentions.map((m) => m.id),
    });
    await this.teams.record(
      ctx,
      membership.teamId,
      'comment.created',
      threadLabel(thread.deploymentShort, thread.path),
      {
        threadId: thread.id,
        deploymentId: thread.deploymentId,
        reply: true,
        mentions: mentions.length,
      },
    );
    await this.tell(ctx, project, thread.deploymentShort, thread.path, input.body, mentions);
    return this.commentView(comment, new Map(mentions.map((m) => [m.id, m.name])));
  }

  private async setResolved(
    ctx: CloudCtx,
    project: ProjectRow,
    membership: MembershipRow,
    threadId: string,
    resolved: boolean,
    deploymentId?: string,
  ): Promise<ThreadView> {
    const thread = await this.thread(project.id, threadId, deploymentId);
    if (resolved === (thread.resolvedAt !== null)) return this.oneView(thread);
    const updated = await this.comments.resolve(
      thread.id,
      resolved
        ? {
            at: new Date(),
            byId: ctx.user.id,
            byName: (ctx.user.name || ctx.user.email).slice(0, 100),
          }
        : null,
    );
    await this.teams.record(
      ctx,
      membership.teamId,
      resolved ? 'comment.resolved' : 'comment.reopened',
      threadLabel(thread.deploymentShort, thread.path),
      { threadId: thread.id },
    );
    return this.oneView(updated);
  }

  private async deleteComment(
    ctx: CloudCtx,
    project: ProjectRow,
    membership: MembershipRow,
    threadId: string,
    commentId: string,
    deploymentId?: string,
  ): Promise<void> {
    const thread = await this.thread(project.id, threadId, deploymentId);
    const comment = thread.comments.find((c) => c.id === commentId);
    if (!comment) throw new NotFoundException('Comment not found');
    const admin = ROLE_RANK[membership.role] >= ROLE_RANK.ADMIN;
    if (comment.authorId !== ctx.user.id && !admin) {
      throw new ForbiddenException('Only its author or a team admin can delete a comment');
    }
    const threadGone = await this.comments.deleteComment(thread.id, comment.id);
    await this.teams.record(
      ctx,
      membership.teamId,
      'comment.deleted',
      threadLabel(thread.deploymentShort, thread.path),
      { threadId: thread.id, threadDeleted: threadGone },
    );
  }

  /** 30 comments a minute per person (429 past it). */
  private take(userId: string, now: number = Date.now()): void {
    const recent = (this.recent.get(userId) ?? []).filter((at) => now - at < MINUTE_MS);
    if (recent.length >= COMMENTS_PER_MINUTE) {
      throw new HttpException('Too many comments; wait a minute', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.recent.set(userId, recent);
    if (this.recent.size > 10_000) {
      for (const [id, times] of this.recent) {
        if (times.every((at) => now - at >= MINUTE_MS)) this.recent.delete(id);
      }
    }
  }

  /** The mentioned people who are current members of the team, never the author. */
  private async mentionable(teamId: string, authorId: string, ids: string[]) {
    if (ids.length === 0) return [];
    const members = await this.comments.members(teamId);
    return members.filter((m) => ids.includes(m.id) && m.id !== authorId);
  }

  private inboxUrl(project: ProjectRow, locale: string): string {
    return `${this.config.cloudUrl}/${locale}/console/${project.team.slug}/${project.slug}?tab=comments`;
  }

  /** Emails each mentioned person once; a failure is logged, never fails the comment. */
  private async tell(
    ctx: CloudCtx,
    project: ProjectRow,
    shortId: string,
    path: string,
    body: string,
    mentions: Array<{ email: string; locale: Locale }>,
  ): Promise<void> {
    for (const person of mentions) {
      const locale = toApiLocale(person.locale);
      try {
        await this.mail.send(
          cloudCommentMentionEmail({
            to: person.email,
            locale,
            author: ctx.user.name || ctx.user.email,
            project: project.name,
            deployment: shortId,
            path,
            body,
            url: this.inboxUrl(project, locale),
            siteUrl: this.config.siteUrl,
          }),
        );
      } catch (error) {
        this.logger.error(`A comment's mention email couldn't be sent: ${String(error)}`);
      }
    }
  }
}
