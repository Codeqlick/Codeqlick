import { Module } from '@nestjs/common';
import { CruisingAdminController } from './cruising-admin.controller.js';
import { CruisingPushService } from './cruising-push.service.js';
import { CruisingSocialController } from './cruising-social.controller.js';
import { CruisingSocialService } from './cruising-social.service.js';
import { CruisingController, CruisingPublicController } from './cruising.controller.js';
import { CruisingRepository } from './cruising.repository.js';
import { CruisingService } from './cruising.service.js';

/** Cruising at cruising.codeqlick.com (architecture 4.15). */
@Module({
  controllers: [
    CruisingPublicController,
    CruisingController,
    CruisingSocialController,
    CruisingAdminController,
  ],
  providers: [CruisingService, CruisingSocialService, CruisingPushService, CruisingRepository],
})
export class CruisingModule {}
