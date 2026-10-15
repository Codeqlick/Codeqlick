import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { toApiLocale } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { TicketStatus } from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { ticketClientEmail, ticketTeamEmail } from './support-emails.js';
import {
  SupportRepository,
  type MessageWithAuthor,
  type TicketDetailRow,
  type TicketSummaryRow,
} from './support.repository.js';
import type {
  AdminTicketMessageInput,
  CreateTicketInput,
  ListTicketsQuery,
  TicketMessageInput,
  UpdateTicketInput,
} from './support.schemas.js';

export interface TicketSummary {
  id: string;
  number: number;
  type: string;
  priority: string;
  status: string;
  title: string;
  client: { id: string; name: string; email: string };
  project: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface TicketMessageView {
  id: string;
  body: string;
  createdAt: string;
  /** `team`: written by Codeqlick; otherwise by the client. */
  author: { name: string; team: boolean };
}

export type TicketDetail = TicketSummary & { messages: TicketMessageView[] };

function toSummary(row: TicketSummaryRow): TicketSummary {
  return {
    id: row.id,
    number: row.number,
    type: row.type,
    priority: row.priority,
    status: row.status,
    title: row.title,
    client: { id: row.client.id, name: row.client.name, email: row.client.email },
    project: row.project,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

function toMessage(message: MessageWithAuthor): TicketMessageView {
  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    author: {
      name: message.author?.name ?? 'Codeqlick',
      team: message.author ? message.author.role === 'ADMIN' : true,
    },
  };
}

function toDetail(row: TicketDetailRow): TicketDetail {
  return { ...toSummary(row), messages: row.messages.map(toMessage) };
}

/**
 * Support requests: clients open them from the portal and talk with the team on each one. Every
 * step emails the other side; mail problems are logged and never fail the request.
 */
@Injectable()
export class SupportService {
  private readonly logger = new Logger(SupportService.name);

  constructor(
    private readonly repository: SupportRepository,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly activity: ActivityService,
  ) {}

  // ---- Portal ---------------------------------------------------------------------------

  async listMine(caller: AuthUser, query: ListTicketsQuery): Promise<Paginated<TicketSummary>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const { items, total } = await this.repository.list(
      { clientId: caller.id, status: query.status, active: query.active },
      skip,
      take,
    );
    return paginate(items.map(toSummary), total, query.page, query.pageSize);
  }

  async getMine(caller: AuthUser, id: string): Promise<TicketDetail> {
    return toDetail(await this.findForCaller(caller, id));
  }

  async open(caller: AuthUser, input: CreateTicketInput): Promise<TicketDetail> {
    if (caller.role !== 'CLIENT') throw new BadRequestException('Requests are opened by clients');
    if (input.projectId && !(await this.repository.findClientProject(caller.id, input.projectId))) {
      throw new BadRequestException({
        errors: [{ path: 'projectId', message: 'Unknown project' }],
      });
    }
    const row = await this.repository.create({
      clientId: caller.id,
      projectId: input.projectId ?? null,
      type: input.type,
      priority: input.priority,
      title: input.title,
      body: input.body,
    });
    this.notify(
      ticketTeamEmail(
        this.config.leadsNotifyTo,
        row.client,
        row,
        { kind: 'opened', body: input.body },
        this.adminLink(row.id),
        this.config.siteUrl,
      ),
    );
    await this.activity.record(caller, {
      action: 'support.opened',
      targetId: row.id,
      targetLabel: `#${row.number} ${row.title}`,
    });
    return toDetail(row);
  }

  /** The client answers; a request waiting for them goes back to the team. */
  async replyAsClient(
    caller: AuthUser,
    id: string,
    input: TicketMessageInput,
  ): Promise<TicketDetail> {
    const ticket = await this.findForCaller(caller, id);
    if (ticket.status === 'CLOSED') throw new ConflictException('This request is closed');
    const next: TicketStatus | undefined =
      ticket.status === 'WAITING_CLIENT' || ticket.status === 'RESOLVED'
        ? 'IN_PROGRESS'
        : undefined;
    const row = await this.repository.addMessage(id, caller.id, input.body, next);
    if (caller.role === 'CLIENT') {
      this.notify(
        ticketTeamEmail(
          this.config.leadsNotifyTo,
          row.client,
          row,
          { kind: 'replied', body: input.body },
          this.adminLink(row.id),
          this.config.siteUrl,
        ),
      );
    }
    return toDetail(row);
  }

  /** The client closes their own request. */
  async close(caller: AuthUser, id: string): Promise<TicketDetail> {
    await this.findForCaller(caller, id);
    const row = await this.repository.update(id, { status: 'CLOSED' });
    await this.activity.record(caller, {
      action: 'support.closed',
      targetId: id,
      targetLabel: `#${row.number} ${row.title}`,
    });
    return toDetail(row);
  }

  // ---- Admin ----------------------------------------------------------------------------

  async list(query: ListTicketsQuery): Promise<Paginated<TicketSummary>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const { items, total } = await this.repository.list(
      { status: query.status, active: query.active },
      skip,
      take,
    );
    return paginate(items.map(toSummary), total, query.page, query.pageSize);
  }

  async get(id: string): Promise<TicketDetail> {
    return toDetail(await this.findOrThrow(id));
  }

  /** The team answers; by default the request then waits for the client. */
  async replyAsTeam(
    author: AuthUser,
    id: string,
    input: AdminTicketMessageInput,
  ): Promise<TicketDetail> {
    await this.findOrThrow(id);
    const row = await this.repository.addMessage(
      id,
      author.id,
      input.body,
      input.status ?? 'WAITING_CLIENT',
    );
    this.emailClient(row, (link, locale) =>
      ticketClientEmail(
        row.client,
        row,
        { kind: 'replied', body: input.body, authorName: author.name || 'Codeqlick' },
        link,
        locale,
        this.config.siteUrl,
      ),
    );
    await this.activity.record(author, {
      action: 'support.replied',
      targetId: id,
      targetLabel: `#${row.number} ${row.title}`,
    });
    return toDetail(row);
  }

  async update(author: AuthUser, id: string, input: UpdateTicketInput): Promise<TicketDetail> {
    const existing = await this.findOrThrow(id);
    const row = await this.repository.update(id, input);
    if (input.status && input.status !== existing.status) {
      // Telling the client matters when their request is done (or reopened); not for every hop.
      if (['RESOLVED', 'CLOSED'].includes(input.status) || existing.resolvedAt) {
        this.emailClient(row, (link, locale) =>
          ticketClientEmail(row.client, row, { kind: 'status' }, link, locale, this.config.siteUrl),
        );
      }
      await this.activity.record(author, {
        action: 'support.updated',
        targetId: id,
        targetLabel: `#${row.number} ${row.title}`,
        details: { status: input.status },
      });
    }
    return toDetail(row);
  }

  countActive(): Promise<number> {
    return this.repository.countActive();
  }

  // ---- Helpers --------------------------------------------------------------------------

  private async findForCaller(caller: AuthUser, id: string): Promise<TicketDetailRow> {
    const ticket = await this.repository.findById(id);
    // Clients only see their own requests; admins may look at any.
    if (!ticket || (caller.role !== 'ADMIN' && ticket.clientId !== caller.id)) {
      throw new NotFoundException('Request not found');
    }
    return ticket;
  }

  private async findOrThrow(id: string): Promise<TicketDetailRow> {
    const ticket = await this.repository.findById(id);
    if (!ticket) throw new NotFoundException('Request not found');
    return ticket;
  }

  private adminLink(id: string): string {
    return `${this.config.siteUrl}/es/admin/support/${id}`;
  }

  private emailClient(
    row: TicketDetailRow,
    build: (link: string, locale: 'en' | 'es') => MailMessage,
  ): void {
    if (!row.client.isActive) return;
    const locale = toApiLocale(row.client.locale);
    this.notify(build(`${this.config.siteUrl}/${locale}/portal/support/${row.id}`, locale));
  }

  /** Fire-and-forget: mail problems are logged and never fail the request. */
  private notify(message: MailMessage): void {
    this.mail.send(message).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Support email to ${message.to} failed: ${reason}`);
    });
  }
}
