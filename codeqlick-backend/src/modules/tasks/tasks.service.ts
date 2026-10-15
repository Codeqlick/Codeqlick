import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { accountOf, type AuthUser } from '../../common/types/auth-user.js';
import { ActivityService, type ActivityActor } from '../activity/activity.service.js';
import { hashKey } from '../projects/release-key.js';
import { SupportService } from '../support/support.service.js';
import { TasksRepository, type TaskRow } from './tasks.repository.js';
import type {
  CreateTaskInput,
  ListTasksQuery,
  TaskFromTicketInput,
  UpdateTaskInput,
} from './tasks.schemas.js';

export interface TaskView {
  id: string;
  title: string;
  description: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  /** The support request it came from. */
  ticket: { id: string; number: number } | null;
  doneAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** What the client sees: no description (it is for the team). */
export type ClientTaskView = Omit<TaskView, 'description'>;

function toView(row: TaskRow): TaskView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    ticket: row.ticket,
    doneAt: row.doneAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toClientView(row: TaskRow): ClientTaskView {
  const { description, ...view } = toView(row);
  void description;
  return view;
}

const PIPELINE = { id: null, name: 'Despliegue automático' } as const;

/**
 * Tasks per client project: changes asked for in support requests and planned work. Done tasks
 * resolve the request they came from (the client is told). The project's release key can read and
 * update them, so the work can be followed from the repository.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly repository: TasksRepository,
    private readonly activity: ActivityService,
    private readonly support: SupportService,
  ) {}

  async list(projectId: string, query: ListTasksQuery): Promise<TaskView[]> {
    await this.findProject(projectId);
    return (await this.repository.list(projectId, query.status)).map(toView);
  }

  /** The client's view of their project's tasks. */
  async listForClient(caller: AuthUser, projectId: string): Promise<ClientTaskView[]> {
    const project = await this.repository.findProject(projectId);
    if (!project || (caller.role !== 'ADMIN' && project.clientId !== accountOf(caller))) {
      throw new NotFoundException('Project not found');
    }
    return (await this.repository.list(projectId)).map(toClientView);
  }

  async create(actor: ActivityActor, projectId: string, input: CreateTaskInput): Promise<TaskView> {
    const project = await this.findProject(projectId);
    const row = await this.repository.create({
      projectId,
      title: input.title,
      description: input.description ?? null,
    });
    await this.activity.record(actor, {
      action: 'project.task_created',
      targetId: projectId,
      targetLabel: project.name,
      details: { title: row.title },
    });
    return toView(row);
  }

  async update(
    actor: ActivityActor,
    projectId: string,
    taskId: string,
    input: UpdateTaskInput,
  ): Promise<TaskView> {
    const project = await this.findProject(projectId);
    const existing = await this.repository.findTask(projectId, taskId);
    if (!existing) throw new NotFoundException('Task not found');
    const status = input.status && input.status !== existing.status ? input.status : undefined;
    const row = await this.repository.update(taskId, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(status ? { status, doneAt: status === 'DONE' ? new Date() : null } : {}),
    });
    if (status) {
      await this.activity.record(actor, {
        action: 'project.task_updated',
        targetId: projectId,
        targetLabel: project.name,
        details: { title: row.title, taskStatus: status },
      });
      // The request it came from is resolved once all its tasks are done; the client is told.
      if (
        status === 'DONE' &&
        row.ticket &&
        (await this.repository.allDoneForTicket(row.ticket.id))
      ) {
        await this.resolveTicket(actor, row.ticket.id);
      }
    }
    return toView(row);
  }

  async remove(actor: AuthUser, projectId: string, taskId: string): Promise<void> {
    const project = await this.findProject(projectId);
    const task = await this.repository.findTask(projectId, taskId);
    if (!task) throw new NotFoundException('Task not found');
    await this.repository.delete(task.id);
    await this.activity.record(actor, {
      action: 'project.task_deleted',
      targetId: projectId,
      targetLabel: project.name,
      details: { title: task.title },
    });
  }

  /** Turns a support request into a task; an open request moves to in progress. */
  async fromTicket(
    actor: AuthUser,
    ticketId: string,
    input: TaskFromTicketInput,
  ): Promise<TaskView> {
    const ticket = await this.repository.findTicket(ticketId);
    if (!ticket) throw new NotFoundException('Request not found');
    const projectId = input.projectId ?? ticket.projectId;
    if (!projectId) {
      throw new BadRequestException({
        errors: [{ path: 'projectId', message: 'Choose the project the task goes to' }],
      });
    }
    const project = await this.findProject(projectId);
    if (project.clientId !== ticket.clientId) {
      throw new BadRequestException({
        errors: [{ path: 'projectId', message: "Not one of the client's projects" }],
      });
    }
    const row = await this.repository.create({
      projectId,
      ticketId,
      title: input.title ?? ticket.title,
      description: ticket.messages[0]?.body ?? null,
    });
    if (ticket.status === 'OPEN' || ticket.status === 'WAITING_CLIENT') {
      await this.support.update(actor, ticketId, { status: 'IN_PROGRESS' });
    }
    await this.activity.record(actor, {
      action: 'project.task_created',
      targetId: projectId,
      targetLabel: project.name,
      details: { title: row.title, request: ticket.number },
    });
    return toView(row);
  }

  // ---- With the project's release key (from the repository) ---------------------------

  async listWithKey(key: string, query: ListTasksQuery): Promise<TaskView[]> {
    const project = await this.projectForKey(key);
    return (await this.repository.list(project.id, query.status)).map(toView);
  }

  async updateWithKey(key: string, taskId: string, input: UpdateTaskInput): Promise<TaskView> {
    const project = await this.projectForKey(key);
    return this.update(PIPELINE, project.id, taskId, input);
  }

  async createWithKey(key: string, input: CreateTaskInput): Promise<TaskView> {
    const project = await this.projectForKey(key);
    return this.create(PIPELINE, project.id, input);
  }

  // ---- Helpers --------------------------------------------------------------------------

  private async resolveTicket(actor: ActivityActor, ticketId: string): Promise<void> {
    await this.support.update(actor, ticketId, { status: 'RESOLVED' });
  }

  private async projectForKey(key: string) {
    const project = key ? await this.repository.findProjectByKeyHash(hashKey(key)) : null;
    if (!project) throw new UnauthorizedException('Unknown release key');
    return project;
  }

  private async findProject(id: string) {
    const project = await this.repository.findProject(id);
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}
