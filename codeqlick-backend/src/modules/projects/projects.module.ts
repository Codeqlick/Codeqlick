import { Module } from '@nestjs/common';
import { AdminProjectsController } from './admin-projects.controller.js';
import { PortalProjectsController } from './portal-projects.controller.js';
import { ProjectFilesStorage } from './project-files.storage.js';
import { ProjectsRepository } from './projects.repository.js';
import { ProjectsService } from './projects.service.js';

@Module({
  controllers: [PortalProjectsController, AdminProjectsController],
  providers: [ProjectsService, ProjectsRepository, ProjectFilesStorage],
})
export class ProjectsModule {}
