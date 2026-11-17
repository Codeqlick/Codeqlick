import { Module } from '@nestjs/common';
import { AdultModule } from '../adult/adult.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { MulterModule } from '@nestjs/platform-express';
import { AppConfigService } from '../../config/app-config.service.js';
import { CruisingAdminController } from './cruising-admin.controller.js';
import { CruisingAlbumService } from './cruising-album.service.js';
import { CruisingCommunityController } from './cruising-community.controller.js';
import { CruisingCommunityRepository } from './cruising-community.repository.js';
import { CruisingCommunityService } from './cruising-community.service.js';
import { CruisingFfmpeg } from './cruising-ffmpeg.js';
import { CruisingInsightsController } from './cruising-insights.controller.js';
import { CruisingInsightsService } from './cruising-insights.service.js';
import {
  CruisingMediaAdminController,
  CruisingMediaController,
} from './cruising-media.controller.js';
import { CruisingMediaRepository } from './cruising-media.repository.js';
import { CruisingMediaService } from './cruising-media.service.js';
import { CruisingMediaStorage } from './cruising-media.storage.js';
import { CruisingNotificationsController } from './cruising-notifications.controller.js';
import { CruisingNotificationsRepository } from './cruising-notifications.repository.js';
import { CruisingNotificationsService } from './cruising-notifications.service.js';
import { CruisingOnboardingService } from './cruising-onboarding.service.js';
import { CruisingPushService } from './cruising-push.service.js';
import {
  CruisingRoomsAdminController,
  CruisingRoomsController,
} from './cruising-rooms.controller.js';
import { CruisingRoomsRepository } from './cruising-rooms.repository.js';
import { CruisingRoomsService } from './cruising-rooms.service.js';
import {
  CruisingSafetyAdminController,
  CruisingSafetyController,
  CruisingSafetyPublicController,
} from './cruising-safety.controller.js';
import { CruisingSafetyRepository } from './cruising-safety.repository.js';
import { CruisingSafetyService } from './cruising-safety.service.js';
import {
  CruisingOnboardingController,
  CruisingStatsAdminController,
} from './cruising-stats.controller.js';
import { CruisingStatsRepository } from './cruising-stats.repository.js';
import { CruisingStatsService } from './cruising-stats.service.js';
import { CruisingSocialController } from './cruising-social.controller.js';
import { CruisingSocialService } from './cruising-social.service.js';
import { CruisingWinksService } from './cruising-winks.service.js';
import { CruisingController, CruisingPublicController } from './cruising.controller.js';
import { CruisingRepository } from './cruising.repository.js';
import { CruisingService } from './cruising.service.js';

/** Cruising at cruising.codeqlick.com (architecture 4.15). */
@Module({
  imports: [
    // The shared safety of the 18+ apps (architecture 4.16).
    AdultModule,
    // The account's username is the Cruising name by default (owner's feedback 2026-11-17).
    AuthModule,
    // Uploads (up to 100 MB videos) are written to the private work folder as they arrive, never
    // held in memory; the service deletes each one or moves it into the transcoding queue.
    MulterModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        storage: new CruisingMediaStorage(config).uploadEngine(),
      }),
    }),
  ],
  controllers: [
    CruisingPublicController,
    CruisingController,
    CruisingSocialController,
    CruisingInsightsController,
    CruisingCommunityController,
    CruisingMediaController,
    CruisingAdminController,
    CruisingMediaAdminController,
    CruisingSafetyPublicController,
    CruisingSafetyController,
    CruisingSafetyAdminController,
    CruisingRoomsController,
    CruisingRoomsAdminController,
    CruisingNotificationsController,
    CruisingOnboardingController,
    CruisingStatsAdminController,
  ],
  providers: [
    CruisingService,
    CruisingSocialService,
    CruisingInsightsService,
    CruisingCommunityService,
    CruisingMediaService,
    CruisingPushService,
    CruisingSafetyService,
    CruisingSafetyRepository,
    CruisingRepository,
    CruisingCommunityRepository,
    CruisingMediaRepository,
    CruisingMediaStorage,
    CruisingFfmpeg,
    CruisingAlbumService,
    CruisingRoomsService,
    CruisingRoomsRepository,
    CruisingNotificationsService,
    CruisingNotificationsRepository,
    CruisingWinksService,
    CruisingStatsRepository,
    CruisingStatsService,
    CruisingOnboardingService,
  ],
})
export class CruisingModule {}
