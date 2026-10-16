import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppConfigService } from '../../config/app-config.service.js';
import { toApiLocale, toDbLocale, type ApiLocale } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import {
  LeadStatus,
  type LeadReply as LeadReplyRow,
  type Lead as LeadRow,
  type Prisma,
} from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { leadsToCsv } from './leads-csv.js';
import { leadAcknowledgementEmail, leadNotificationEmail, leadReplyEmail } from './lead-emails.js';
import { BriefsService } from '../briefs/briefs.service.js';
import { ProjectsService } from '../projects/projects.service.js';
import { UsersService } from '../users/users.service.js';
import { LeadsRepository } from './leads.repository.js';
import type {
  CreateLeadInput,
  ConvertLeadInput,
  CreateLeadReplyInput,
  ListLeadsQuery,
  UpdateLeadInput,
} from './leads.schemas.js';

/** Most rows a CSV export returns. */
export const EXPORT_LIMIT = 10_000;

export interface Lead {
  id: string;
  name: string;
  email: string;
  company: string | null;
  budget: string | null;
  projectType: string | null;
  message: string;
  locale: ApiLocale;
  status: LeadRow['status'];
  notes: string | null;
  lostReason: LeadRow['lostReason'];
  /** `yyyy-mm-dd`, or null. */
  followUpOn: string | null;
  /** The client account it became, once converted. */
  clientId: string | null;
  /** The basic-website request it came from, if any (see managed-sites/site-request.ts). */
  siteRequest: unknown;
  createdAt: string;
  updatedAt: string;
}

export function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    company: row.company,
    budget: row.budget,
    projectType: row.projectType,
    message: row.message,
    locale: toApiLocale(row.locale),
    status: row.status,
    notes: row.notes,
    lostReason: row.lostReason,
    followUpOn: row.followUpOn?.toISOString().slice(0, 10) ?? null,
    clientId: row.clientId,
    siteRequest: row.siteRequest ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export interface ConvertedLead {
  lead: Lead;
  client: { id: string; created: boolean; invitationSent?: boolean };
  project: { id: string; name: string };
}

export interface LeadReply {
  id: string;
  subject: string;
  body: string;
  author: { name: string };
  createdAt: string;
}

/** A sent reply, with the lead's status afterwards (a first reply moves NEW to TALKING). */
export interface SentLeadReply {
  reply: LeadReply;
  lead: Lead;
}

function toLeadReply(row: LeadReplyRow): LeadReply {
  return {
    id: row.id,
    subject: row.subject,
    body: row.body,
    author: { name: row.authorName },
    createdAt: row.createdAt.toISOString(),
  };
}

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly repository: LeadsRepository,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly activity: ActivityService,
    private readonly users: UsersService,
    private readonly projects: ProjectsService,
    private readonly briefs: BriefsService,
  ) {}

  /**
   * "Convert to client": the lead's person gets a client account (welcome email to choose a
   * password; an existing client account is reused), a project is opened for them in Discovery,
   * and the lead is marked WON and linked to the account.
   */
  async convert(actor: AuthUser, id: string, input: ConvertLeadInput): Promise<ConvertedLead> {
    const existing = await this.get(id);
    if (existing.clientId) throw new ConflictException('This lead is already a client');
    const client = await this.users.findOrCreateClient(actor, {
      email: existing.email,
      name: existing.name,
      locale: existing.locale,
    });
    const project = await this.projects.create(actor, {
      clientId: client.id,
      name: input.projectName ?? existing.company ?? existing.name,
      phase: 'DISCOVERY',
      progress: 0,
    });
    // The new project asks for its brief: the portal shows it, the welcome email brings them in.
    await this.briefs.request(actor, project.id, false);
    const lead = toLead(
      await this.repository.update(id, {
        status: 'WON',
        lostReason: null,
        followUpOn: null,
        client: { connect: { id: client.id } },
      }),
    );
    await this.activity.record(actor, {
      action: 'lead.converted',
      targetId: id,
      targetLabel: lead.name,
      details: { project: project.name },
    });
    return {
      lead,
      client: { id: client.id, created: client.created, invitationSent: client.invitationSent },
      project: { id: project.id, name: project.name },
    };
  }

  /** `siteRequest`: the structured request when it came from the basic-website request form. */
  async create(
    input: CreateLeadInput,
    siteRequest?: Prisma.InputJsonValue,
  ): Promise<{ id: string }> {
    if (input.website && input.website.trim() !== '') {
      // Honeypot hit: pretend success so bots learn nothing.
      this.logger.warn('Lead honeypot triggered; submission discarded');
      return { id: randomUUID() };
    }

    const row = await this.repository.create({
      name: input.name,
      email: input.email.trim().toLowerCase(),
      company: input.company ?? null,
      budget: input.budget ?? null,
      projectType: input.projectType ?? null,
      message: input.message,
      locale: toDbLocale(input.locale),
      ...(siteRequest ? { siteRequest } : {}),
    });

    const lead = toLead(row);
    this.sendInBackground(
      leadNotificationEmail(this.config.leadsNotifyTo, lead, this.config.siteUrl),
      'notification',
    );
    this.sendInBackground(leadAcknowledgementEmail(lead, this.config.siteUrl), 'acknowledgement');
    return { id: row.id };
  }

  /**
   * A call booked from the website: the open lead with that email moves to the CALL stage (or a
   * new one starts there), with the call's day as its follow-up. No emails: the booking sends its own.
   */
  async fromBooking(input: {
    name: string;
    email: string;
    company: string | null;
    message: string | null;
    locale: ApiLocale;
    day: string;
  }): Promise<{ id: string }> {
    const email = input.email.trim().toLowerCase();
    const followUpOn = new Date(`${input.day}T00:00:00Z`);
    const open = await this.repository.findOpenByEmail(email);
    if (open) {
      await this.repository.update(open.id, { status: LeadStatus.CALL, followUpOn });
      return { id: open.id };
    }
    const row = await this.repository.create({
      name: input.name,
      email,
      company: input.company,
      message: input.message ?? '(Call booked from the website)',
      locale: toDbLocale(input.locale),
      status: LeadStatus.CALL,
      followUpOn,
    });
    return { id: row.id };
  }

  async list(query: ListLeadsQuery): Promise<Paginated<Lead>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const { items, total } = await this.repository.list(
      { status: query.status, q: query.q || undefined },
      skip,
      take,
    );
    return paginate(items.map(toLead), total, query.page, query.pageSize);
  }

  /** All leads matching the list filters as CSV (capped at EXPORT_LIMIT rows). */
  async exportCsv(query: Pick<ListLeadsQuery, 'status' | 'q'>): Promise<string> {
    const rows = await this.repository.listAll(
      { status: query.status, q: query.q || undefined },
      EXPORT_LIMIT,
    );
    return leadsToCsv(rows.map(toLead));
  }

  async get(id: string): Promise<Lead> {
    const row = await this.repository.findById(id);
    if (!row) throw new NotFoundException('Lead not found');
    return toLead(row);
  }

  async update(actor: AuthUser, id: string, input: UpdateLeadInput): Promise<Lead> {
    const existing = await this.get(id);
    const data: Prisma.LeadUpdateInput = {};
    if (input.status !== undefined) data.status = input.status;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.followUpOn !== undefined) {
      data.followUpOn =
        input.followUpOn === null ? null : new Date(`${input.followUpOn}T00:00:00Z`);
    }
    // A reason only means something while the lead is lost.
    const status = input.status ?? existing.status;
    if (status !== 'LOST') data.lostReason = null;
    else if (input.lostReason !== undefined) data.lostReason = input.lostReason;
    const lead = toLead(await this.repository.update(id, data));
    await this.activity.record(actor, {
      action: 'lead.updated',
      targetId: id,
      targetLabel: lead.name,
      details:
        input.status !== undefined && input.status !== existing.status
          ? { status: input.status }
          : undefined,
    });
    return lead;
  }

  async listReplies(id: string): Promise<LeadReply[]> {
    await this.get(id);
    return (await this.repository.listReplies(id)).map(toLeadReply);
  }

  /**
   * Emails an answer to the lead from MAIL_FROM and keeps it in the lead's history. Nothing is
   * stored when the email can't be sent, so the history only shows what the visitor received.
   */
  async reply(actor: AuthUser, id: string, input: CreateLeadReplyInput): Promise<SentLeadReply> {
    const lead = await this.get(id);
    try {
      await this.mail.send(leadReplyEmail(lead, input, this.config.siteUrl));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send the reply to a lead: ${reason}`);
      throw new ServiceUnavailableException('The reply could not be sent');
    }
    const saved = await this.repository.addReply({
      leadId: id,
      authorId: actor.id,
      authorName: actor.name,
      subject: input.subject,
      body: input.body,
    });
    await this.activity.record(actor, {
      action: 'lead.replied',
      targetId: id,
      targetLabel: lead.name,
      details: { subject: input.subject },
    });
    return { reply: toLeadReply(saved.reply), lead: toLead(saved.lead) };
  }

  /** Fire-and-forget: mail problems are logged and never fail the request. */
  private sendInBackground(message: MailMessage, kind: string): void {
    let pending: Promise<void>;
    try {
      pending = this.mail.send(message);
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send lead ${kind} email: ${reason}`);
    });
  }
}
