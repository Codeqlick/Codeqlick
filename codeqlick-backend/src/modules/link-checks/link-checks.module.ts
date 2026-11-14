import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { LinkChecksController } from './link-checks.controller.js';
import { LinkChecksRepository } from './link-checks.repository.js';
import { LinkChecksService } from './link-checks.service.js';

@Module({
  imports: [MediaModule],
  controllers: [LinkChecksController],
  providers: [LinkChecksService, LinkChecksRepository],
})
export class LinkChecksModule {}
