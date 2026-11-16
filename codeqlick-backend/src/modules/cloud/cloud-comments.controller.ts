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
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CloudApi } from '../../common/decorators/cloud-api.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import { Caller, type CloudCtx } from './cloud-caller.js';
import {
  COMMENTS_PAGE_HEADERS,
  OVERLAY_HEADERS,
  OVERLAY_SCRIPT,
  renderCommentsPage,
} from './cloud-comments-page.js';
import { COMMENTS_HEADER } from './cloud-comments.js';
import {
  CloudCommentsService,
  type CommentView,
  type OverlayHeaders,
  type ThreadView,
} from './cloud-comments.service.js';
import { pageLocale, safeNext } from './cloud-protection.js';
import {
  commentInputSchema,
  commentParamSchema,
  commentSessionSchema,
  commentsQuerySchema,
  createThreadSchema,
  overlayCommentParamSchema,
  overlayThreadParamSchema,
  resolveThreadSchema,
  threadParamSchema,
  type CommentInput,
  type CommentParam,
  type CommentSessionInput,
  type CommentsQuery,
  type CreateThreadInput,
  type OverlayCommentParam,
  type OverlayThreadParam,
  type ResolveThreadInput,
  type ThreadParam,
} from './cloud.schemas.js';

function header(request: Request, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** What Nginx sends with `/__codeqlick/comments…`, plus the overlay's token. */
function overlayHeaders(request: Request): OverlayHeaders {
  return {
    key: header(request, 'x-cq-protection-key'),
    host: header(request, 'x-cq-host'),
    kind: header(request, 'x-cq-kind'),
    token: header(request, COMMENTS_HEADER),
  };
}

const ip = (request: Request) => request.ip?.slice(0, 45) ?? null;

function sendScript(res: Response): void {
  for (const [name, value] of Object.entries(OVERLAY_HEADERS)) res.setHeader(name, value);
  res.status(200).send(OVERLAY_SCRIPT);
}

/** The overlay script, public (architecture 4.13 "Preview comments", decision 111). */
@ApiExcludeController()
@Public()
@Controller('cloud/comments')
export class CloudCommentsScriptController {
  @Get('overlay.js')
  script(@Res() res: Response): void {
    sendScript(res);
  }
}

/**
 * The comments page and the overlay's API on a deployment's address, as Nginx proxies them from
 * `/__codeqlick/comments…` (decision 111). Every route needs Nginx's key and a preview address;
 * the API routes also the comments token. `api.codeqlick.com` doesn't serve them.
 */
@ApiExcludeController()
@Public()
@Controller('cloud/protection/comments')
export class CloudCommentsOverlayController {
  constructor(private readonly comments: CloudCommentsService) {}

  @Get()
  page(@Req() request: Request, @Res() res: Response): void {
    this.comments.assertPreview(overlayHeaders(request));
    for (const [name, value] of Object.entries(COMMENTS_PAGE_HEADERS)) res.setHeader(name, value);
    const html = renderCommentsPage({
      locale: pageLocale(request.headers['accept-language']),
      path: safeNext(request.query.path),
    });
    res.status(200).type('html').send(html);
  }

  @Get('overlay.js')
  script(@Res() res: Response): void {
    sendScript(res);
  }

  @Get('api/me')
  me(@Req() request: Request) {
    return this.comments.overlayMe(overlayHeaders(request), ip(request));
  }

  @Get('api/threads')
  threads(@Req() request: Request) {
    return this.comments.overlayThreads(overlayHeaders(request), ip(request));
  }

  @Post('api/threads')
  create(
    @Req() request: Request,
    @Body({ schema: createThreadSchema }) body: CreateThreadInput,
  ): Promise<ThreadView> {
    return this.comments.overlayCreate(overlayHeaders(request), ip(request), body);
  }

  @Post('api/threads/:threadId/comments')
  reply(
    @Req() request: Request,
    @Param({ schema: overlayThreadParamSchema }) params: OverlayThreadParam,
    @Body({ schema: commentInputSchema }) body: CommentInput,
  ): Promise<CommentView> {
    return this.comments.overlayReply(overlayHeaders(request), ip(request), params.threadId, body);
  }

  @Patch('api/threads/:threadId')
  resolve(
    @Req() request: Request,
    @Param({ schema: overlayThreadParamSchema }) params: OverlayThreadParam,
    @Body({ schema: resolveThreadSchema }) body: ResolveThreadInput,
  ): Promise<ThreadView> {
    return this.comments.overlayResolve(
      overlayHeaders(request),
      ip(request),
      params.threadId,
      body.resolved,
    );
  }

  @Delete('api/threads/:threadId/comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Req() request: Request,
    @Param({ schema: overlayCommentParamSchema }) params: OverlayCommentParam,
  ): Promise<void> {
    return this.comments.overlayDelete(
      overlayHeaders(request),
      ip(request),
      params.threadId,
      params.commentId,
    );
  }
}

/** A project's preview comments, for its team (session or API token). */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@CloudApi()
@Controller('cloud/projects/:id/comments')
export class CloudCommentsController {
  constructor(private readonly comments: CloudCommentsService) {}

  @Get()
  list(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: commentsQuerySchema }) query: CommentsQuery,
  ): Promise<{ open: number; items: ThreadView[] }> {
    return this.comments.list(ctx, params.id, query);
  }

  @Post(':threadId/comments')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  reply(
    @Caller() ctx: CloudCtx,
    @Param({ schema: threadParamSchema }) params: ThreadParam,
    @Body({ schema: commentInputSchema }) body: CommentInput,
  ): Promise<CommentView> {
    return this.comments.reply(ctx, params.id, params.threadId, body);
  }

  @Patch(':threadId')
  resolve(
    @Caller() ctx: CloudCtx,
    @Param({ schema: threadParamSchema }) params: ThreadParam,
    @Body({ schema: resolveThreadSchema }) body: ResolveThreadInput,
  ): Promise<ThreadView> {
    return this.comments.resolve(ctx, params.id, params.threadId, body.resolved);
  }

  @Delete(':threadId/comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Caller() ctx: CloudCtx,
    @Param({ schema: commentParamSchema }) params: CommentParam,
  ): Promise<void> {
    return this.comments.removeComment(ctx, params.id, params.threadId, params.commentId);
  }
}

/** Opening a deployment's comments page: a signed-in person only (no API token). */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('cloud/projects/:id/comments')
export class CloudCommentsSessionController {
  constructor(private readonly comments: CloudCommentsService) {}

  @Post('session')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  session(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: commentSessionSchema }) body: CommentSessionInput,
  ): Promise<{ url: string; expiresAt: string }> {
    return this.comments.session(ctx, params.id, body);
  }
}
