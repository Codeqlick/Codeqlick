import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  localeQuerySchema,
  slugParamSchema,
  type LocaleQuery,
  type SlugParam,
} from '../../common/schemas/common.schemas.js';
import type { Paginated } from '../../common/types/paginated.js';
import { listPublicPostsQuerySchema, type ListPublicPostsQuery } from './posts.schemas.js';
import { PostsService, type PostDetail, type PostSummary } from './posts.service.js';

@ApiTags('posts')
@Public()
@Controller('posts')
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Get()
  list(
    @Query({ schema: listPublicPostsQuerySchema }) query: ListPublicPostsQuery,
  ): Promise<Paginated<PostSummary>> {
    return this.posts.listPublished(query);
  }

  @Get(':slug')
  get(
    @Param({ schema: slugParamSchema }) params: SlugParam,
    @Query({ schema: localeQuerySchema }) query: LocaleQuery,
  ): Promise<PostDetail> {
    return this.posts.getPublishedBySlug(params.slug, query.locale);
  }
}
