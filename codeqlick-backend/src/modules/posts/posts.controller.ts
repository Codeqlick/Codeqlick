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
import {
  listPublicPostsQuerySchema,
  relatedPostsQuerySchema,
  type ListPublicPostsQuery,
  type RelatedPostsQuery,
} from './posts.schemas.js';
import { TagsService, type PublicTag } from './tags.service.js';
import { PostsService, type PostDetail, type PostSummary } from './posts.service.js';

@ApiTags('posts')
@Public()
@Controller('posts')
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly tags: TagsService,
  ) {}

  @Get()
  list(
    @Query({ schema: listPublicPostsQuerySchema }) query: ListPublicPostsQuery,
  ): Promise<Paginated<PostSummary>> {
    return this.posts.listPublished(query);
  }

  /** Tags used by live posts, with how many, by name in `locale`. Before `:slug` on purpose. */
  @Get('tags')
  listTags(
    @Query({ schema: localeQuerySchema }) query: LocaleQuery,
  ): Promise<(PublicTag & { count: number })[]> {
    return this.tags.listPublic(query.locale);
  }

  @Get(':slug/related')
  related(
    @Param({ schema: slugParamSchema }) params: SlugParam,
    @Query({ schema: relatedPostsQuerySchema }) query: RelatedPostsQuery,
  ): Promise<PostSummary[]> {
    return this.posts.related(params.slug, query.locale, query.limit);
  }

  @Get(':slug')
  get(
    @Param({ schema: slugParamSchema }) params: SlugParam,
    @Query({ schema: localeQuerySchema }) query: LocaleQuery,
  ): Promise<PostDetail> {
    return this.posts.getPublishedBySlug(params.slug, query.locale);
  }
}
