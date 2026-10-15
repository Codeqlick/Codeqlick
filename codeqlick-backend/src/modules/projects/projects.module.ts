import { Module } from '@nestjs/common';
import { AdminProjectsController } from './admin-projects.controller.js';
import { PortalProjectsController } from './portal-projects.controller.js';
import { ProjectFilesStorage } from './project-files.storage.js';
import { ReleasesController } from './releases.controller.js';
import { ProjectsRepository } from './projects.repository.js';
import { WeeklyDigestService } from './weekly-digest.service.js';
import { ProjectsService } from './projects.service.js';

@Module({
  controllers: [PortalProjectsController, AdminProjectsController, ReleasesController],
  providers: [ProjectsService, ProjectsRepository, ProjectFilesStorage, WeeklyDigestService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
