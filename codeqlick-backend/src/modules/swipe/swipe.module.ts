import { Module } from '@nestjs/common';
import { SwipeAdminController } from './swipe-admin.controller.js';
import { SwipeController, SwipePublicController } from './swipe.controller.js';
import { SwipeRepository } from './swipe.repository.js';
import { SwipeService } from './swipe.service.js';
import { SwipeStorage } from './swipe.storage.js';

/** Swipe at swipe.codeqlick.com (architecture 4.10). */
@Module({
  controllers: [SwipePublicController, SwipeController, SwipeAdminController],
  providers: [SwipeService, SwipeRepository, SwipeStorage],
})
export class SwipeModule {}
