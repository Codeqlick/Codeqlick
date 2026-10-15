import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import { accountOf, type AuthUser } from '../../common/types/auth-user.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { TicketStatus } from '../../generated/prisma/client.js';
import { AccountsService, type AccountPerson } from '../accounts/accounts.service.js';
import { ActivityService, type ActivityActor } from '../activity/activity.service.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { cleanContentType, cleanFileName } from '../projects/project-file-name.js';
import type { UploadedProjectFile } from '../projects/projects.service.js';
import { ticketClientEmail, ticketTeamEmail } from './support-emails.js';
import { TicketFilesStorage } from './ticket-files.storage.js';
import {
  SupportRepository,
  type AttachmentWithUploader,
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

export interface TicketFileView {
  id: string;
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
  /** Who added it; `team` as for messages. */
  author: { name: string; team: boolean };
}

export interface TicketFileDownload {
  stream: ReadStream;
  name: string;
  size: number;
}

/** Largest file accepted on a support request, in bytes (as for project files). */
export const MAX_TICKET_FILE_BYTES = 25 * 1024 * 1024;

export type TicketDetail = TicketSummary & {
  messages: TicketMessageView[];
  files: TicketFileView[];
  /** Project tasks made from this request. */
  tasks: { id: string; title: string; status: string; project: { id: string; name: string } }[];
};

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

function toFile(file: AttachmentWithUploader): TicketFileView {
  return {
    id: file.id,
    name: file.name,
    contentType: file.contentType,
    size: file.size,
    createdAt: file.createdAt.toISOString(),
    author: {
      name: file.uploadedBy?.name ?? 'Codeqlick',
      team: file.uploadedBy ? file.uploadedBy.role === 'ADMIN' : true,
    },
  };
}

function toDetail(row: TicketDetailRow): TicketDetail {
  return {
    ...toSummary(row),
    messages: row.messages.map(toMessage),
    files: row.files.map(toFile),
    tasks: row.tasks,
  };
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
    private readonly storage: TicketFilesStorage,
    private readonly accounts: AccountsService,
  ) {}

  // ---- Portal ---------------------------------------------------------------------------

  async listMine(caller: AuthUser, query: ListTicketsQuery): Promise<Paginated<TicketSummary>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const { items, total } = await this.repository.list(
      { clientId: accountOf(caller), status: query.status, active: query.active },
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
    if (
      input.projectId &&
      !(await this.repository.findClientProject(accountOf(caller), input.projectId))
    ) {
      throw new BadRequestException({
        errors: [{ path: 'projectId', message: 'Unknown project' }],
      });
    }
    const row = await this.repository.create({
      clientId: accountOf(caller),
      authorId: caller.id,
      projectId: input.projectId ?? null,
      type: input.type,
      priority: input.priority,
      title: input.title,
      body: input.body,
    });
    this.notify(
      ticketTeamEmail(
        this.config.leadsNotifyTo,
        { name: caller.name, email: caller.email },
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
          { name: caller.name, email: caller.email },
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

  /**
   * The client or the team adds a file to an open request. A client's file emails the team, as a
   * reply would.
   */
  async addFile(
    caller: AuthUser,
    id: string,
    upload: UploadedProjectFile | undefined,
  ): Promise<TicketDetail> {
    if (!upload || upload.buffer.length === 0) {
      throw new BadRequestException('Send the file in a multipart field called "file"');
    }
    const ticket = await this.findForCaller(caller, id);
    if (ticket.status === 'CLOSED') throw new ConflictException('This request is closed');

    const fileId = randomUUID();
    await this.storage.write(fileId, upload.buffer);
    let name: string;
    try {
      ({ name } = await this.repository.addFile({
        id: fileId,
        ticketId: id,
        uploadedById: caller.id,
        name: cleanFileName(upload.originalname),
        contentType: cleanContentType(upload.mimetype),
        size: upload.buffer.length,
      }));
    } catch (error) {
      await this.storage.remove(fileId);
      throw error;
    }
    const row = await this.findOrThrow(id);
    if (caller.role === 'CLIENT') {
      this.notify(
        ticketTeamEmail(
          this.config.leadsNotifyTo,
          { name: caller.name, email: caller.email },
          row,
          { kind: 'replied', body: `Attached a file: ${name}` },
          this.adminLink(row.id),
          this.config.siteUrl,
        ),
      );
    }
    await this.activity.record(caller, {
      action: 'support.file_added',
      targetId: id,
      targetLabel: `#${row.number} ${row.title}`,
      details: { file: name },
    });
    return toDetail(row);
  }

  async downloadFile(caller: AuthUser, id: string, fileId: string): Promise<TicketFileDownload> {
    await this.findForCaller(caller, id);
    const file = await this.repository.findFile(id, fileId);
    if (!file) throw new NotFoundException('File not found');
    return { stream: this.storage.read(file.id), name: file.name, size: file.size };
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
    this.emailClient(row, (person, link, locale) =>
      ticketClientEmail(
        person,
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

  async update(author: ActivityActor, id: string, input: UpdateTicketInput): Promise<TicketDetail> {
    const existing = await this.findOrThrow(id);
    const row = await this.repository.update(id, input);
    if (input.status && input.status !== existing.status) {
      // Telling the client matters when their request is done (or reopened); not for every hop.
      if (['RESOLVED', 'CLOSED'].includes(input.status) || existing.resolvedAt) {
        this.emailClient(row, (person, link, locale) =>
          ticketClientEmail(person, row, { kind: 'status' }, link, locale, this.config.siteUrl),
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

  /** Removes a file (e.g. one shared by mistake). */
  async deleteFile(actor: AuthUser, id: string, fileId: string): Promise<void> {
    const ticket = await this.findOrThrow(id);
    const file = await this.repository.findFile(id, fileId);
    if (!file) throw new NotFoundException('File not found');
    await this.repository.deleteFile(file.id);
    await this.storage.remove(file.id);
    await this.activity.record(actor, {
      action: 'support.file_deleted',
      targetId: id,
      targetLabel: `#${ticket.number} ${ticket.title}`,
      details: { file: file.name },
    });
  }

  countActive(): Promise<number> {
    return this.repository.countActive();
  }

  // ---- Helpers --------------------------------------------------------------------------

  private async findForCaller(caller: AuthUser, id: string): Promise<TicketDetailRow> {
    const ticket = await this.repository.findById(id);
    // Clients only see their own requests; admins may look at any.
    if (!ticket || (caller.role !== 'ADMIN' && ticket.clientId !== accountOf(caller))) {
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

  /** Emails every active person of the client account, each in their language. */
  private emailClient(
    row: TicketDetailRow,
    build: (person: AccountPerson, link: string, locale: 'en' | 'es') => MailMessage,
  ): void {
    void this.accounts.people(row.clientId).then((people) => {
      for (const person of people) {
        this.notify(
          build(
            person,
            `${this.config.siteUrl}/${person.locale}/portal/support/${row.id}`,
            person.locale,
          ),
        );
      }
    });
  }

  /** Fire-and-forget: mail problems are logged and never fail the request. */
  private notify(message: MailMessage): void {
    this.mail.send(message).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Support email to ${message.to} failed: ${reason}`);
    });
  }
}
