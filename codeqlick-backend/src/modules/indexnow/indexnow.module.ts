import { Module } from '@nestjs/common';
import { IndexNowController } from './indexnow.controller.js';
import { IndexNowRepository } from './indexnow.repository.js';
import { IndexNowService } from './indexnow.service.js';

/** IndexNow (architecture 4.1): posts and case studies announce their changes through it. */
@Module({
  controllers: [IndexNowController],
  providers: [IndexNowService, IndexNowRepository],
  exports: [IndexNowService],
})
export class IndexNowModule {}
