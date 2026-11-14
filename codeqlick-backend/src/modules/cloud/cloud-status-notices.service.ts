import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import type { CloudStatusNoticeState } from '../../generated/prisma/client.js';
import type { CloudCtx } from './cloud-caller.js';
import { CloudMonitorsService } from './cloud-monitors.service.js';
import { CloudStatusNoticesRepository, type NoticeRow } from './cloud-status-notices.repository.js';
import {
  earliestNewStart,
  INCIDENT_STATES,
  isOpen,
  noticeState,
  windowProblem,
  type NoticeKind,
  type NoticeState,
} from './cloud-status-notices.js';
import type {
  CreateStatusNoticeInput,
  StatusNoticesQuery,
  StatusNoticeUpdateInput,
  UpdateStatusNoticeInput,
} from './cloud.schemas.js';
import { CloudTeamsService } from './cloud-teams.service.js';

export interface StatusNoticeView {
  id: string;
  kind: NoticeKind;
  title: string;
  /** Incidents: their state; maintenance: its phase now (SCHEDULED, IN_PROGRESS, COMPLETED). */
  state: NoticeState;
  open: boolean;
  monitorIds: string[];
  startsAt: string | null;
  endsAt: string | null;
  resolvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Newest first. */
  updates: Array<{
    id: string;
    state: NoticeState | null;
    body: string;
    createdBy: string | null;
    createdAt: string;
  }>;
}

const MAX_OPEN = 20;
const MAX_UPDATES = 50;

/** Incident notes and scheduled maintenance on status pages (architecture 4.13; decision 62). */
@Injectable()
export class CloudStatusNoticesService {
  constructor(
    private readonly repository: CloudStatusNoticesRepository,
    private readonly teams: CloudTeamsService,
    private readonly monitors: CloudMonitorsService,
  ) {}

  view(notice: NoticeRow, now = new Date()): StatusNoticeView {
    return {
      id: notice.id,
      kind: notice.kind,
      title: notice.title,
      state: noticeState(notice, now),
      open: isOpen(notice, now),
      monitorIds: notice.monitorIds,
      startsAt: notice.startsAt?.toISOString() ?? null,
      endsAt: notice.endsAt?.toISOString() ?? null,
      resolvedAt: notice.resolvedAt?.toISOString() ?? null,
      createdBy: notice.createdBy?.name ?? null,
      createdAt: notice.createdAt.toISOString(),
      updatedAt: notice.updatedAt.toISOString(),
      updates: notice.updates.map((update) => ({
        id: update.id,
        state: update.state,
        body: update.body,
        createdBy: update.createdBy?.name ?? null,
        createdAt: update.createdAt.toISOString(),
      })),
    };
  }

  private async notice(ctx: CloudCtx, id: string, min: 'MEMBER' | 'ADMIN' = 'MEMBER') {
    const notice = await this.repository.find(id);
    if (!notice) throw new NotFoundException('Notice not found');
    await this.teams.accessById(ctx, notice.teamId, min);
    return notice;
  }

  private async checkMonitors(teamId: string, ids: string[]): Promise<void> {
    if ((await this.repository.monitorsInTeam(teamId, ids)) !== ids.length) {
      throw new BadRequestException('Every monitor must be one of the team');
    }
  }

  private async checkOpenLimit(teamId: string, now: Date): Promise<void> {
    if ((await this.repository.countOpen(teamId, now)) >= MAX_OPEN) {
      throw new ConflictException(`A team has at most ${MAX_OPEN} open notices`);
    }
  }

  private checkWindow(startsAt: Date, endsAt: Date, now: Date, earliest: Date | null): void {
    const problem = windowProblem(startsAt, endsAt, now, earliest);
    if (problem) throw new BadRequestException(problem);
  }

  async list(
    ctx: CloudCtx,
    teamSlug: string,
    query: StatusNoticesQuery,
    now = new Date(),
  ): Promise<Paginated<StatusNoticeView>> {
    const membership = await this.teams.access(ctx, teamSlug);
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const { items, total } = await this.repository.list(
      membership.teamId,
      query.open,
      now,
      skip,
      take,
    );
    return paginate(
      items.map((notice) => this.view(notice, now)),
      total,
      query.page,
      query.pageSize,
    );
  }

  async get(ctx: CloudCtx, id: string): Promise<StatusNoticeView> {
    return this.view(await this.notice(ctx, id));
  }

  async create(
    ctx: CloudCtx,
    teamSlug: string,
    input: CreateStatusNoticeInput,
    now = new Date(),
  ): Promise<StatusNoticeView> {
    const membership = await this.teams.access(ctx, teamSlug, 'ADMIN');
    const teamId = membership.teamId;
    let state: CloudStatusNoticeState;
    let startsAt: Date | null = null;
    let endsAt: Date | null = null;
    if (input.kind === 'INCIDENT') {
      state = input.state ?? 'INVESTIGATING';
      if (!(INCIDENT_STATES as readonly string[]).includes(state)) {
        throw new BadRequestException(
          `An incident's state is one of ${INCIDENT_STATES.join(', ')}`,
        );
      }
      if (input.startsAt || input.endsAt) {
        throw new BadRequestException('Only a maintenance has a start and an end');
      }
    } else {
      if (input.state) throw new BadRequestException("A maintenance's phase comes from its window");
      if (!input.startsAt || !input.endsAt) {
        throw new BadRequestException('A maintenance needs startsAt and endsAt');
      }
      startsAt = new Date(input.startsAt);
      endsAt = new Date(input.endsAt);
      this.checkWindow(startsAt, endsAt, now, earliestNewStart(now));
      state = 'SCHEDULED';
    }
    await this.checkMonitors(teamId, input.monitorIds);
    const resolvedAt = state === 'RESOLVED' ? now : null;
    if (!resolvedAt) await this.checkOpenLimit(teamId, now);
    const notice = await this.repository.create(
      {
        teamId,
        kind: input.kind,
        title: input.title,
        state,
        monitorIds: input.monitorIds,
        startsAt,
        endsAt,
        resolvedAt,
        createdById: ctx.user.id,
      },
      { state: input.kind === 'INCIDENT' ? state : null, body: input.body },
    );
    this.monitors.forgetStatus(notice.team.slug);
    await this.teams.record(ctx, teamId, 'status.notice.create', notice.title, {
      id: notice.id,
      kind: notice.kind,
    });
    return this.view(notice, now);
  }

  async update(
    ctx: CloudCtx,
    id: string,
    input: UpdateStatusNoticeInput,
    now = new Date(),
  ): Promise<StatusNoticeView> {
    const notice = await this.notice(ctx, id, 'ADMIN');
    const data: Parameters<CloudStatusNoticesRepository['update']>[1] = {};
    if (notice.kind === 'MAINTENANCE' && noticeState(notice, now) === 'COMPLETED') {
      throw new ConflictException('A completed maintenance can no longer be edited');
    }
    if (input.startsAt !== undefined || input.endsAt !== undefined) {
      if (notice.kind !== 'MAINTENANCE') {
        throw new BadRequestException('Only a maintenance has a start and an end');
      }
      const startsAt = input.startsAt ? new Date(input.startsAt) : notice.startsAt!;
      const endsAt = input.endsAt ? new Date(input.endsAt) : notice.endsAt!;
      // A past start only when the maintenance is created: a changed start can't be in the past.
      const moved = startsAt.getTime() !== notice.startsAt?.getTime();
      this.checkWindow(startsAt, endsAt, now, moved ? now : null);
      data.startsAt = startsAt;
      data.endsAt = endsAt;
    }
    if (input.title !== undefined) data.title = input.title;
    if (input.monitorIds) {
      await this.checkMonitors(notice.teamId, input.monitorIds);
      data.monitorIds = input.monitorIds;
    }
    const updated = await this.repository.update(notice.id, data);
    this.monitors.forgetStatus(updated.team.slug);
    await this.teams.record(ctx, notice.teamId, 'status.notice.update', updated.title, {
      id: notice.id,
      edit: Object.keys(input),
    });
    return this.view(updated, now);
  }

  async addUpdate(
    ctx: CloudCtx,
    id: string,
    input: StatusNoticeUpdateInput,
    now = new Date(),
  ): Promise<StatusNoticeView> {
    const notice = await this.notice(ctx, id, 'ADMIN');
    const data: Parameters<CloudStatusNoticesRepository['update']>[1] = {};
    let state: CloudStatusNoticeState | null = null;
    if (notice.kind === 'INCIDENT') {
      if (!input.state || !(INCIDENT_STATES as readonly string[]).includes(input.state)) {
        throw new BadRequestException(
          `An incident's update sets its state: one of ${INCIDENT_STATES.join(', ')}`,
        );
      }
      state = input.state;
      data.state = state;
      if (state === 'RESOLVED') {
        if (!notice.resolvedAt) data.resolvedAt = now;
      } else if (notice.resolvedAt) {
        // Reopened: it counts as open again.
        await this.checkOpenLimit(notice.teamId, now);
        data.resolvedAt = null;
      }
    } else {
      if (input.state && input.state !== 'COMPLETED') {
        throw new BadRequestException(
          "A maintenance's update is a note, or COMPLETED to end it early",
        );
      }
      if (noticeState(notice, now) === 'COMPLETED') {
        throw new ConflictException('This maintenance is already completed');
      }
      if (input.state === 'COMPLETED') {
        state = 'COMPLETED';
        data.state = 'COMPLETED';
        data.resolvedAt = now;
      }
    }
    if ((await this.repository.countUpdates(notice.id)) >= MAX_UPDATES) {
      throw new ConflictException(`A notice has at most ${MAX_UPDATES} updates`);
    }
    const updated = await this.repository.addUpdate(
      notice.id,
      { state, body: input.body, createdById: ctx.user.id },
      data,
    );
    this.monitors.forgetStatus(updated.team.slug);
    await this.teams.record(ctx, notice.teamId, 'status.notice.update', updated.title, {
      id: notice.id,
      state,
    });
    return this.view(updated, now);
  }

  async remove(ctx: CloudCtx, id: string): Promise<void> {
    const notice = await this.notice(ctx, id, 'ADMIN');
    await this.repository.remove(notice.id);
    this.monitors.forgetStatus(notice.team.slug);
    await this.teams.record(ctx, notice.teamId, 'status.notice.delete', notice.title, {
      id: notice.id,
      kind: notice.kind,
    });
  }
}
