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
})
export class SecurityChecksModule {}
