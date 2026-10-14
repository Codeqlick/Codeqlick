import { Module } from '@nestjs/common';
import { AdminMediaController } from './admin-media.controller.js';
import { MediaController } from './media.controller.js';
import { MediaRepository } from './media.repository.js';
import { MediaService } from './media.service.js';
import { MediaStorage } from './media.storage.js';

@Module({
  controllers: [MediaController, AdminMediaController],
  providers: [MediaService, MediaStorage, MediaRepository],
})
export class MediaModule {}
