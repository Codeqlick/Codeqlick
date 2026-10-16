import { Injectable, NotFoundException } from '@nestjs/common';
import { accountOf, type AuthUser } from '../../common/types/auth-user.js';
import { ActivityService } from '../activity/activity.service.js';
import { PlansService } from './plans.service.js';
import { TimeRepository, type EntryRow } from './time.repository.js';
import type { CreateTimeEntryInput } from './time.schemas.js';

export interface TimeEntryView {
  id: string;
  /** `yyyy-mm-dd`. */
  date: string;
  minutes: number;
  description: string;
  author: { name: string };
  project: { id: string; name: string; client: { id: string; name: string } };
}

/** A project's hours: the total, a total per month (newest first) and the entries. */
export interface ProjectTime {
  totalMinutes: number;
  months: { month: string; minutes: number }[];
  entries: TimeEntryView[];
}

/** Every project's hours in one month. */
export interface MonthTime {
  month: string;
  totalMinutes: number;
  projects: {
    id: string;
    name: string;
    client: { id: string; name: string };
    minutes: number;
  }[];
  entries: TimeEntryView[];
}

/** The current month in Madrid, as `yyyy-mm`. */
export function madridMonth(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now).slice(0, 7);
}

function toView(row: EntryRow): TimeEntryView {
  return {
    id: row.id,
    date: row.date.toISOString().slice(0, 10),
    minutes: row.minutes,
    description: row.description,
    author: { name: row.user?.name ?? 'Codeqlick' },
    project: row.project,
  };
}

/** Sums minutes by key, keeping the order in which keys first appear. */
function sumBy<K>(rows: TimeEntryView[], key: (row: TimeEntryView) => K): Map<K, number> {
  const totals = new Map<K, number>();
  for (const row of rows) totals.set(key(row), (totals.get(key(row)) ?? 0) + row.minutes);
  return totals;
}

/**
 * Time tracking: the team logs hours on client projects in the admin panel. Clients see them in
 * the portal only on projects where the team turned `showHours` on.
 */
@Injectable()
export class TimeService {
  constructor(
    private readonly repository: TimeRepository,
    private readonly activity: ActivityService,
    private readonly plans: PlansService,
  ) {}

  async forProject(projectId: string): Promise<ProjectTime> {
    await this.findProject(projectId);
    return this.summary(projectId);
  }

  /** The client's view: 404 unless it is their project and its hours are shown. */
  async forClient(caller: AuthUser, projectId: string): Promise<ProjectTime> {
    const project = await this.repository.findProject(projectId);
    const visible =
      project &&
      (caller.role === 'ADMIN' || (project.clientId === accountOf(caller) && project.showHours));
    if (!visible) throw new NotFoundException('Project not found');
    return this.summary(projectId);
  }

  async log(author: AuthUser, projectId: string, input: CreateTimeEntryInput) {
    const project = await this.findProject(projectId);
    const row = await this.repository.create({
      projectId,
      userId: author.id,
      date: new Date(`${input.date}T00:00:00Z`),
      minutes: input.minutes,
      description: input.description,
    });
    await this.activity.record(author, {
      action: 'project.time_logged',
      targetId: projectId,
      targetLabel: project.name,
      details: { minutes: input.minutes },
    });
    await this.plans.checkAlert(projectId);
    return toView(row);
  }

  async remove(author: AuthUser, projectId: string, entryId: string): Promise<void> {
    const project = await this.findProject(projectId);
    const entry = await this.repository.findEntry(projectId, entryId);
    if (!entry) throw new NotFoundException('Time entry not found');
    await this.repository.delete(entry.id);
    await this.activity.record(author, {
      action: 'project.time_deleted',
      targetId: projectId,
      targetLabel: project.name,
      details: { minutes: entry.minutes },
    });
  }

  async month(month = madridMonth()): Promise<MonthTime> {
    const [year, number] = month.split('-').map(Number) as [number, number];
    const from = new Date(Date.UTC(year, number - 1, 1));
    const to = new Date(Date.UTC(year, number, 1));
    const entries = (await this.repository.listBetween(from, to)).map(toView);
    const byProject = sumBy(entries, (entry) => entry.project.id);
    const projects = [...byProject].map(([id, minutes]) => {
      const { project } = entries.find((entry) => entry.project.id === id)!;
      return { ...project, minutes };
    });
    projects.sort((a, b) => b.minutes - a.minutes);
    return {
      month,
      totalMinutes: entries.reduce((sum, entry) => sum + entry.minutes, 0),
      projects,
      entries,
    };
  }

  private async summary(projectId: string): Promise<ProjectTime> {
    const entries = (await this.repository.listForProject(projectId)).map(toView);
    return {
      totalMinutes: entries.reduce((sum, entry) => sum + entry.minutes, 0),
      // Entries are newest first, so the months come out newest first too.
      months: [...sumBy(entries, (entry) => entry.date.slice(0, 7))].map(([month, minutes]) => ({
        month,
        minutes,
      })),
      entries,
    };
  }

  private async findProject(id: string) {
    const project = await this.repository.findProject(id);
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}
