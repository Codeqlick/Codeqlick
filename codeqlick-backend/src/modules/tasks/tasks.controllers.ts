import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { bearerKey } from '../projects/release-key.js';
import {
  createTaskSchema,
  keyTaskParamSchema,
  listTasksQuerySchema,
  taskFromTicketSchema,
  taskParamSchema,
  updateTaskSchema,
  type CreateTaskInput,
  type KeyTaskParam,
  type ListTasksQuery,
  type TaskFromTicketInput,
  type TaskParam,
  type UpdateTaskInput,
} from './tasks.schemas.js';
import { TasksService, type ClientTaskView, type TaskView } from './tasks.service.js';

@ApiTags('admin/tasks')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('projects/:id/tasks')
  list(
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: listTasksQuerySchema }) query: ListTasksQuery,
  ): Promise<TaskView[]> {
    return this.tasks.list(params.id, query);
  }

  @Post('projects/:id/tasks')
  create(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createTaskSchema }) body: CreateTaskInput,
  ): Promise<TaskView> {
    return this.tasks.create(user, params.id, body);
  }

  @Patch('projects/:id/tasks/:taskId')
  update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: taskParamSchema }) params: TaskParam,
    @Body({ schema: updateTaskSchema }) body: UpdateTaskInput,
  ): Promise<TaskView> {
    return this.tasks.update(user, params.id, params.taskId, body);
  }

  @Delete('projects/:id/tasks/:taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param({ schema: taskParamSchema }) params: TaskParam,
  ): Promise<void> {
    await this.tasks.remove(user, params.id, params.taskId);
  }

  /** Turns a support request into a task on the client's project. */
  @Post('tickets/:id/task')
  fromTicket(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: taskFromTicketSchema }) body: TaskFromTicketInput,
  ): Promise<TaskView> {
    return this.tasks.fromTicket(user, params.id, body);
  }
}

@ApiTags('portal')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('portal/projects')
export class PortalTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get(':id/tasks')
  list(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<ClientTaskView[]> {
    return this.tasks.listForClient(user, params.id);
  }
}

/** The tasks of the release key's project, for the repository (`Authorization: Bearer cqr_…`). */
@ApiTags('releases')
@ApiHeader({ name: 'Authorization', description: 'Bearer <release key>' })
@Controller('tasks')
export class KeyTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  list(
    @Headers('authorization') authorization: string | undefined,
    @Query({ schema: listTasksQuerySchema }) query: ListTasksQuery,
  ): Promise<TaskView[]> {
    return this.tasks.listWithKey(bearerKey(authorization), query);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post()
  create(
    @Headers('authorization') authorization: string | undefined,
    @Body({ schema: createTaskSchema }) body: CreateTaskInput,
  ): Promise<TaskView> {
    return this.tasks.createWithKey(bearerKey(authorization), body);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Patch(':taskId')
  update(
    @Headers('authorization') authorization: string | undefined,
    @Param({ schema: keyTaskParamSchema }) params: KeyTaskParam,
    @Body({ schema: updateTaskSchema }) body: UpdateTaskInput,
  ): Promise<TaskView> {
    return this.tasks.updateWithKey(bearerKey(authorization), params.taskId, body);
  }
}
