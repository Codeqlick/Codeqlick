import { Module } from '@nestjs/common';
import { IndexNowModule } from '../indexnow/indexnow.module.js';
import { AdminPostsController } from './admin-posts.controller.js';
import { AdminTagsController } from './admin-tags.controller.js';
import { PostsController } from './posts.controller.js';
import { PostsRepository } from './posts.repository.js';
import { PostsService } from './posts.service.js';
import { TagsRepository } from './tags.repository.js';
import { TagsService } from './tags.service.js';

@Module({
  imports: [IndexNowModule],
  controllers: [PostsController, AdminPostsController, AdminTagsController],
  providers: [PostsService, PostsRepository, TagsService, TagsRepository],
})
export class PostsModule {}
