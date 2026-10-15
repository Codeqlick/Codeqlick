import { Module } from '@nestjs/common';
import { AdminLeadsController } from './admin-leads.controller.js';
import { LeadsController } from './leads.controller.js';
import { LeadsRepository } from './leads.repository.js';
import { LeadsService } from './leads.service.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [UsersModule, ProjectsModule],
  controllers: [LeadsController, AdminLeadsController],
  providers: [LeadsService, LeadsRepository],
  exports: [LeadsService],
})
export class LeadsModule {}
