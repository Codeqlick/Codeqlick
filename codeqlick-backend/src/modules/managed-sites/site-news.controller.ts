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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  createNewsSchema,
  newsListQuerySchema,
  newsParamSchema,
  newsSettingsBodySchema,
  updateNewsSchema,
  type CreateNewsInput,
  type NewsListQuery,
  type NewsParam,
  type NewsSettingsBody,
  type SiteNewsPostView,
  type UpdateNewsInput,
} from './site-news.js';
import { SiteNewsService, type NewsPage, type NewsPublishResult } from './site-news.service.js';

const HOUR_MS = 60 * 60 * 1000;

/** The client's news of their managed site (architecture 8.2, decision 55). */
@ApiTags('portal/site')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('portal/projects/:id/site')
export class SiteNewsController {
  constructor(private readonly news: SiteNewsService) {}

  @Get('news')
  list(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: newsListQuerySchema }) query: NewsListQuery,
  ): Promise<NewsPage> {
    return this.news.list(user, params.id, query);
  }

  @Post('news')
  @Throttle({ default: { limit: 60, ttl: HOUR_MS } })
  create(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createNewsSchema }) body: CreateNewsInput,
  ): Promise<SiteNewsPostView> {
    return this.news.create(user, params.id, body);
  }

  @Put('news-settings')
  @Throttle({ default: { limit: 30, ttl: HOUR_MS } })
  settings(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: newsSettingsBodySchema }) body: NewsSettingsBody,
  ): Promise<{ enabled: boolean }> {
    return this.news.setEnabled(user, params.id, body.enabled);
  }

  @Get('news/:postId')
  get(
    @CurrentUser() user: AuthUser,
    @Param({ schema: newsParamSchema }) params: NewsParam,
  ): Promise<SiteNewsPostView> {
    return this.news.get(user, params.id, params.postId);
  }

  @Patch('news/:postId')
  @Throttle({ default: { limit: 60, ttl: HOUR_MS } })
  update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: newsParamSchema }) params: NewsParam,
    @Body({ schema: updateNewsSchema }) body: UpdateNewsInput,
  ): Promise<SiteNewsPostView> {
    return this.news.update(user, params.id, params.postId, body);
  }

  @Delete('news/:postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { limit: 60, ttl: HOUR_MS } })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param({ schema: newsParamSchema }) params: NewsParam,
  ): Promise<void> {
    await this.news.remove(user, params.id, params.postId);
  }

  @Post('news/:postId/publish')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: HOUR_MS } })
  publish(
    @CurrentUser() user: AuthUser,
    @Param({ schema: newsParamSchema }) params: NewsParam,
  ): Promise<NewsPublishResult> {
    return this.news.publish(user, params.id, params.postId);
  }

  @Post('news/:postId/unpublish')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: HOUR_MS } })
  unpublish(
    @CurrentUser() user: AuthUser,
    @Param({ schema: newsParamSchema }) params: NewsParam,
  ): Promise<NewsPublishResult> {
    return this.news.unpublish(user, params.id, params.postId);
  }
}

/** The admin's copy of the news routes, for any managed site (architecture 8.2). */
@ApiTags('admin/sites')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/projects/:id/site')
export class AdminSiteNewsController {
  constructor(private readonly news: SiteNewsService) {}

  @Get('news')
  list(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: newsListQuerySchema }) query: NewsListQuery,
  ): Promise<NewsPage> {
    return this.news.list(user, params.id, query);
  }

  @Post('news')
  create(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createNewsSchema }) body: CreateNewsInput,
  ): Promise<SiteNewsPostView> {
    return this.news.create(user, params.id, body);
  }

  @Put('news-settings')
  settings(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: newsSettingsBodySchema }) body: NewsSettingsBody,
  ): Promise<{ enabled: boolean }> {
    return this.news.setEnabled(user, params.id, body.enabled);
  }

  @Get('news/:postId')
  get(
    @CurrentUser() user: AuthUser,
    @Param({ schema: newsParamSchema }) params: NewsParam,
  ): Promise<SiteNewsPostView> {
    return this.news.get(user, params.id, params.postId);
  }

  @Patch('news/:postId')
  update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: newsParamSchema }) params: NewsParam,
    @Body({ schema: updateNewsSchema }) body: UpdateNewsInput,
  ): Promise<SiteNewsPostView> {
    return this.news.update(user, params.id, params.postId, body);
  }

  @Delete('news/:postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param({ schema: newsParamSchema }) params: NewsParam,
  ): Promise<void> {
    await this.news.remove(user, params.id, params.postId);
  }

  @Post('news/:postId/publish')
  @HttpCode(HttpStatus.OK)
  publish(
    @CurrentUser() user: AuthUser,
    @Param({ schema: newsParamSchema }) params: NewsParam,
  ): Promise<NewsPublishResult> {
    return this.news.publish(user, params.id, params.postId);
  }

  @Post('news/:postId/unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(
    @CurrentUser() user: AuthUser,
    @Param({ schema: newsParamSchema }) params: NewsParam,
  ): Promise<NewsPublishResult> {
    return this.news.unpublish(user, params.id, params.postId);
  }
}
