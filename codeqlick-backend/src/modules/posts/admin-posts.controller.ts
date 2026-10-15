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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Paginated } from '../../common/types/paginated.js';
import {
  createPostSchema,
  listAdminPostsQuerySchema,
  updatePostSchema,
  type CreatePostInput,
  type ListAdminPostsQuery,
  type UpdatePostInput,
} from './posts.schemas.js';
import { PostsService, type AdminPost } from './posts.service.js';

@ApiTags('admin/posts')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/posts')
export class AdminPostsController {
  constructor(private readonly posts: PostsService) {}

  @Get()
  list(
    @Query({ schema: listAdminPostsQuerySchema }) query: ListAdminPostsQuery,
  ): Promise<Paginated<AdminPost>> {
    return this.posts.listAll(query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createPostSchema }) body: CreatePostInput,
  ): Promise<AdminPost> {
    return this.posts.create(user, body);
  }

  @Get(':id')
  get(@Param({ schema: idParamSchema }) params: IdParam): Promise<AdminPost> {
    return this.posts.get(params.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updatePostSchema }) body: UpdatePostInput,
  ): Promise<AdminPost> {
    return this.posts.update(user, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    await this.posts.delete(user, params.id);
  }
}
