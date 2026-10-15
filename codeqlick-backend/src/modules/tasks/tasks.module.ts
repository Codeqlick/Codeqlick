import { Module } from '@nestjs/common';
import { SupportModule } from '../support/support.module.js';
import {
  AdminTasksController,
  KeyTasksController,
  PortalTasksController,
} from './tasks.controllers.js';
import { TasksRepository } from './tasks.repository.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [SupportModule],
  controllers: [AdminTasksController, PortalTasksController, KeyTasksController],
  providers: [TasksService, TasksRepository],
})
export class TasksModule {}
