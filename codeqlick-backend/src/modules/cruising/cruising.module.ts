import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AppConfigService } from '../../config/app-config.service.js';
import { CruisingAdminController } from './cruising-admin.controller.js';
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
import { CruisingPushService } from './cruising-push.service.js';
import { CruisingSocialController } from './cruising-social.controller.js';
import { CruisingSocialService } from './cruising-social.service.js';
import { CruisingController, CruisingPublicController } from './cruising.controller.js';
import { CruisingRepository } from './cruising.repository.js';
import { CruisingService } from './cruising.service.js';

/** Cruising at cruising.codeqlick.com (architecture 4.15). */
@Module({
  imports: [
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
  ],
  providers: [
    CruisingService,
    CruisingSocialService,
    CruisingInsightsService,
    CruisingCommunityService,
    CruisingMediaService,
    CruisingPushService,
    CruisingRepository,
    CruisingCommunityRepository,
    CruisingMediaRepository,
    CruisingMediaStorage,
    CruisingFfmpeg,
  ],
})
export class CruisingModule {}
