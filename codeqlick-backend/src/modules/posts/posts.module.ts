import { Module } from '@nestjs/common';
import { AdminPostsController } from './admin-posts.controller.js';
import { PostsController } from './posts.controller.js';
import { PostsRepository } from './posts.repository.js';
import { PostsService } from './posts.service.js';

@Module({
  controllers: [PostsController, AdminPostsController],
  providers: [PostsService, PostsRepository],
})
export class PostsModule {}
