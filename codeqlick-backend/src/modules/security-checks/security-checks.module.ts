import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module.js';
import {
  AdminSecurityChecksController,
  SecurityChecksController,
} from './security-checks.controller.js';
import { SecurityChecksRepository } from './security-checks.repository.js';
import { SecurityChecksService } from './security-checks.service.js';

@Module({
  imports: [LeadsModule],
  controllers: [SecurityChecksController, AdminSecurityChecksController],
  providers: [SecurityChecksService, SecurityChecksRepository],
  // The Surface monitor (Cloud) finds the service through `ModuleRef` with `strict: false`, which
  // doesn't need this export; it is here to document that the service is used outside the module.
  exports: [SecurityChecksService],
})
export class SecurityChecksModule {}
