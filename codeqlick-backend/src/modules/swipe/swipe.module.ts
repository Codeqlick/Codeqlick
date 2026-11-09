import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { SwipeAdminController } from './swipe-admin.controller.js';
import { SwipePushService } from './swipe-push.service.js';
import { SwipeController, SwipePublicController } from './swipe.controller.js';
import { SwipeRepository } from './swipe.repository.js';
import { SwipeService } from './swipe.service.js';
import { SwipeStorage } from './swipe.storage.js';

/** Swipe at swipe.codeqlick.com (architecture 4.10). */
@Module({
  imports: [AuthModule],
  controllers: [SwipePublicController, SwipeController, SwipeAdminController],
  providers: [SwipeService, SwipePushService, SwipeRepository, SwipeStorage],
})
export class SwipeModule {}
