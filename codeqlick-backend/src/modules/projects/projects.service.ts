import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import {
  Role,
  type Prisma,
  type ProjectPhase,
  type ProjectUpdate,
} from '../../generated/prisma/client.js';
import {
  ProjectsRepository,
  type ProjectWithClient,
  type ProjectWithUpdates,
} from './projects.repository.js';
import type {
  CreateProjectInput,
  CreateProjectUpdateInput,
  ListProjectsQuery,
  UpdateProjectInput,
} from './projects.schemas.js';

export interface ProjectUpdateView {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  author: { name: string };
}

export interface ClientProjectView {
  id: string;
  name: string;
  description: string | null;
  phase: ProjectPhase;
  progress: number;
  startDate: string | null;
  dueDate: string | null;
  stagingUrl: string | null;
  productionUrl: string | null;
  client: { id: string; name: string; email: string };
  updates?: ProjectUpdateView[];
  createdAt: string;
  updatedAt: string;
}

function toUpdateView(
  update: ProjectUpdate & { author: { name: string } | null },
): ProjectUpdateView {
  return {
    id: update.id,
    title: update.title,
    body: update.body,
    createdAt: update.createdAt.toISOString(),
    author: { name: update.author?.name ?? 'Codeqlick' },
  };
}

function toView(project: ProjectWithClient | ProjectWithUpdates): ClientProjectView {
  const view: ClientProjectView = {
    id: project.id,
    name: project.name,
    description: project.description,
    phase: project.phase,
    progress: project.progress,
    startDate: project.startDate?.toISOString() ?? null,
    dueDate: project.dueDate?.toISOString() ?? null,
    stagingUrl: project.stagingUrl,
    productionUrl: project.productionUrl,
    client: { id: project.client.id, name: project.client.name, email: project.client.email },
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
  if ('updates' in project) view.updates = project.updates.map(toUpdateView);
  return view;
}

function toDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return new Date(value);
}

@Injectable()
export class ProjectsService {
  constructor(private readonly repository: ProjectsRepository) {}

  // ---- Portal (CLIENT, or ADMIN) ------------------------------------------------------

  async listForCaller(caller: AuthUser): Promise<ClientProjectView[]> {
    const projects = await this.repository.listByClient(caller.id);
    return projects.map(toView);
  }

  async getForCaller(caller: AuthUser, id: string): Promise<ClientProjectView> {
    const project = await this.repository.findById(id);
    // Clients only see their own projects; admins may look at any project.
    if (!project || (caller.role !== 'ADMIN' && project.clientId !== caller.id)) {
      throw new NotFoundException('Project not found');
    }
    return toView(project);
  }

  // ---- Admin --------------------------------------------------------------------------

  async list(query: ListProjectsQuery): Promise<Paginated<ClientProjectView>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const { items, total } = await this.repository.list(
      { clientId: query.clientId, phase: query.phase },
      skip,
      take,
    );
    return paginate(items.map(toView), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<ClientProjectView> {
    return toView(await this.findOrThrow(id));
  }

  async create(input: CreateProjectInput): Promise<ClientProjectView> {
    await this.assertClient(input.clientId);
    const project = await this.repository.create({
      clientId: input.clientId,
      name: input.name,
      description: input.description ?? null,
      phase: input.phase,
      progress: input.progress,
      startDate: toDate(input.startDate) ?? null,
      dueDate: toDate(input.dueDate) ?? null,
      stagingUrl: input.stagingUrl ?? null,
      productionUrl: input.productionUrl ?? null,
    });
    return toView(project);
  }

  async update(id: string, input: UpdateProjectInput): Promise<ClientProjectView> {
    await this.findOrThrow(id);
    if (input.clientId !== undefined) await this.assertClient(input.clientId);

    const data: Prisma.ClientProjectUncheckedUpdateInput = {};
    if (input.clientId !== undefined) data.clientId = input.clientId;
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.phase !== undefined) data.phase = input.phase;
    if (input.progress !== undefined) data.progress = input.progress;
    if (input.startDate !== undefined) data.startDate = toDate(input.startDate);
    if (input.dueDate !== undefined) data.dueDate = toDate(input.dueDate);
    if (input.stagingUrl !== undefined) data.stagingUrl = input.stagingUrl;
    if (input.productionUrl !== undefined) data.productionUrl = input.productionUrl;

    return toView(await this.repository.update(id, data));
  }

  async delete(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.repository.delete(id);
  }

  async addUpdate(
    author: AuthUser,
    projectId: string,
    input: CreateProjectUpdateInput,
  ): Promise<ProjectUpdateView> {
    await this.findOrThrow(projectId);
    const update = await this.repository.addUpdate(projectId, author.id, input.title, input.body);
    return toUpdateView(update);
  }

  private async findOrThrow(id: string): Promise<ProjectWithUpdates> {
    const project = await this.repository.findById(id);
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async assertClient(clientId: string): Promise<void> {
    const user = await this.repository.findUserById(clientId);
    if (!user || user.role !== Role.CLIENT) {
      throw new BadRequestException('clientId must reference an existing CLIENT user');
    }
  }
}
