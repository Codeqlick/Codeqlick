import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { TodoItem } from './portal-todo.js';
import { ProjectsService } from './projects.service.js';

/** The portal home's "Waiting on you": approvals, proposals, requests, brief and review. */
@ApiTags('portal')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('portal/todo')
export class PortalTodoController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  todo(@CurrentUser() user: AuthUser): Promise<{ items: TodoItem[] }> {
    return this.projects.todoForCaller(user);
  }
}
