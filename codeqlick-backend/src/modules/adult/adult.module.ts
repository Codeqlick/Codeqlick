import { Module } from '@nestjs/common';
import { CruisingMediaStorage } from '../cruising/cruising-media.storage.js';
import { CruisingRepository } from '../cruising/cruising.repository.js';
import { SwipeRepository } from '../swipe/swipe.repository.js';
import { SwipeStorage, VideochatPhotoStorage } from '../swipe/swipe.storage.js';
import { VideochatRepository } from '../videochat/videochat.repository.js';
import { AdultAdminService } from './adult-admin.service.js';
import { AdultEvents } from './adult-events.js';
import { AdultMigrationService } from './adult-migration.service.js';
import { AdultSafetyService } from './adult-safety.service.js';
import { AdultVerificationService } from './adult-verification.service.js';
import { AdultAdminController, AdultController } from './adult.controller.js';
import { AdultRepository } from './adult.repository.js';
import { AdultVerificationStorage } from './adult.storage.js';

/**
 * What the three 18+ apps share (architecture 4.16): blocks, one verification, serious
 * suspensions, the team's cross-app history and digest. It imports no app module: it reaches the
 * apps' tables through their repositories (stateless, provided here too) and the app modules
 * import it.
 */
@Module({
  controllers: [AdultController, AdultAdminController],
  providers: [
    AdultEvents,
    AdultRepository,
    AdultSafetyService,
    AdultVerificationService,
    AdultAdminService,
    AdultMigrationService,
    AdultVerificationStorage,
    CruisingRepository,
    SwipeRepository,
    VideochatRepository,
    CruisingMediaStorage,
    SwipeStorage,
    VideochatPhotoStorage,
  ],
  exports: [AdultEvents, AdultSafetyService, AdultVerificationService, AdultAdminService],
})
export class AdultModule {}
