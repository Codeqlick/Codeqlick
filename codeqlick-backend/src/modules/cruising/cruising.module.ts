import { Module } from '@nestjs/common';
import { CruisingAdminController } from './cruising-admin.controller.js';
import { CruisingController, CruisingPublicController } from './cruising.controller.js';
import { CruisingRepository } from './cruising.repository.js';
import { CruisingService } from './cruising.service.js';

/** Cruising at cruising.codeqlick.com (architecture 4.15). */
@Module({
  controllers: [CruisingPublicController, CruisingController, CruisingAdminController],
  providers: [CruisingService, CruisingRepository],
})
export class CruisingModule {}
