import { Module } from '@nestjs/common';
import { MenusAdminService } from './menus-admin.service.js';
import { MenusMaintenanceService } from './menus-maintenance.service.js';
import {
  MenusAdminController,
  MenusController,
  MenusPublicController,
} from './menus.controller.js';
import { MenusRepository } from './menus.repository.js';
import { MenusService } from './menus.service.js';

/** QR menus and catalogues at menu.codeqlick.com (architecture 4.20). */
@Module({
  controllers: [MenusPublicController, MenusController, MenusAdminController],
  providers: [MenusService, MenusAdminService, MenusRepository, MenusMaintenanceService],
})
export class MenusModule {}
