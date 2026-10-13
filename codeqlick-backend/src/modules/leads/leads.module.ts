import { Module } from '@nestjs/common';
import { AdminLeadsController } from './admin-leads.controller.js';
import { LeadsController } from './leads.controller.js';
import { LeadsRepository } from './leads.repository.js';
import { LeadsService } from './leads.service.js';

@Module({
  controllers: [LeadsController, AdminLeadsController],
  providers: [LeadsService, LeadsRepository],
})
export class LeadsModule {}
