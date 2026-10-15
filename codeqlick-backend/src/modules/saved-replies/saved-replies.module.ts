import { Module } from '@nestjs/common';
import { AdminSavedRepliesController } from './admin-saved-replies.controller.js';
import { SavedRepliesRepository } from './saved-replies.repository.js';
import { SavedRepliesService } from './saved-replies.service.js';

@Module({
  controllers: [AdminSavedRepliesController],
  providers: [SavedRepliesService, SavedRepliesRepository],
})
export class SavedRepliesModule {}
