import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { accountOf, type AuthUser } from '../../common/types/auth-user.js';
import { pageToSkipTake, paginate, type Paginated } from '../../common/types/paginated.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { Prisma, ProposalStatus } from '../../generated/prisma/client.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { BriefsService } from '../briefs/briefs.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService, type MailMessage } from '../mail/mail.service.js';
import { proposalAnsweredEmail, proposalSentEmail } from './proposal-emails.js';
import {
  ProposalsRepository,
  type ItemData,
  type ProposalData,
  type ProposalRow,
} from './proposals.repository.js';
import type {
  AcceptProposalInput,
  CreateProposalInput,
  DeclineProposalInput,
  ListProposalsQuery,
  UpdateProposalInput,
} from './proposals.schemas.js';

export interface ProposalItemView {
  id: string;
  description: string;
  quantity: number;
  /** Cents. */
  unitPrice: number;
  /** quantity × unitPrice, in cents. */
  amount: number;
}

export interface ProposalView {
  id: string;
  number: number;
  title: string;
  summary: string;
  terms: string | null;
  currency: string;
  /** `yyyy-mm-dd`. */
  validUntil: string | null;
  status: ProposalStatus;
  /** Sent, and its last valid day has passed (Madrid time): it can't be accepted any more. */
  expired: boolean;
  sentAt: string | null;
  respondedAt: string | null;
  acceptedName: string | null;
  declineReason: string | null;
  client: { id: string; name: string; email: string };
  project: { id: string; name: string } | null;
  items: ProposalItemView[];
  /** Cents. */
  total: number;
  createdAt: string;
  updatedAt: string;
}

/** Today in Madrid, as `yyyy-mm-dd`. */
export function madridToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(now);
}

function toView(row: ProposalRow, today = madridToday()): ProposalView {
  const items = row.items.map((item) => ({
    id: item.id,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    amount: item.quantity * item.unitPrice,
  }));
  const validUntil = row.validUntil?.toISOString().slice(0, 10) ?? null;
  return {
    id: row.id,
    number: row.number,
    title: row.title,
    summary: row.summary,
    terms: row.terms,
    currency: row.currency,
    validUntil,
    status: row.status,
    expired: row.status === 'SENT' && validUntil !== null && validUntil < today,
    sentAt: row.sentAt?.toISOString() ?? null,
    respondedAt: row.respondedAt?.toISOString() ?? null,
    acceptedName: row.acceptedName,
    declineReason: row.declineReason,
    client: { id: row.client.id, name: row.client.name, email: row.client.email },
    project: row.project,
    items,
    total: items.reduce((sum, item) => sum + item.amount, 0),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const label = (row: { number: number; title: string }) => `#${row.number} ${row.title}`;

/**
 * Proposals and quotes: the team drafts them in the admin panel and sends them; the client reads
 * them in the portal and accepts or declines. Nothing is charged here.
 */
@Injectable()
export class ProposalsService {
  private readonly logger = new Logger(ProposalsService.name);

  constructor(
    private readonly repository: ProposalsRepository,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
    private readonly activity: ActivityService,
    private readonly accounts: AccountsService,
    private readonly briefs: BriefsService,
  ) {}

  // ---- Portal ---------------------------------------------------------------------------

  /** The caller's proposals, drafts left out. */
  async listMine(caller: AuthUser, query: ListProposalsQuery): Promise<Paginated<ProposalView>> {
    return this.listWhere(
      { clientId: accountOf(caller), status: query.status ?? { not: 'DRAFT' } },
      query,
    );
  }

  async getMine(caller: AuthUser, id: string): Promise<ProposalView> {
    return toView(await this.findForClient(caller, id));
  }

  async accept(caller: AuthUser, id: string, input: AcceptProposalInput): Promise<ProposalView> {
    if (caller.role !== 'CLIENT') throw new ForbiddenException('Only the client can accept it');
    const view = toView(await this.findForClient(caller, id));
    this.assertOpen(view);
    const row = await this.repository.transition(id, 'SENT', {
      status: 'ACCEPTED',
      respondedAt: new Date(),
      acceptedName: input.name,
    });
    if (!row) throw new ConflictException('This proposal has already been answered');
    // Work starts: the project's brief is asked for (unless it was sent already).
    if (row.projectId) await this.briefs.request(caller, row.projectId, true);
    return this.answered(caller, row, { kind: 'accepted', name: input.name });
  }

  async decline(caller: AuthUser, id: string, input: DeclineProposalInput): Promise<ProposalView> {
    if (caller.role !== 'CLIENT') throw new ForbiddenException('Only the client can decline it');
    const view = toView(await this.findForClient(caller, id));
    if (view.status !== 'SENT') throw new ConflictException('This proposal is not open');
    const reason = input.reason || null;
    const row = await this.repository.transition(id, 'SENT', {
      status: 'DECLINED',
      respondedAt: new Date(),
      declineReason: reason,
    });
    if (!row) throw new ConflictException('This proposal has already been answered');
    return this.answered(caller, row, { kind: 'declined', reason });
  }

  // ---- Admin ----------------------------------------------------------------------------

  list(query: ListProposalsQuery): Promise<Paginated<ProposalView>> {
    return this.listWhere(
      {
        ...(query.status ? { status: query.status } : {}),
        ...(query.clientId ? { clientId: query.clientId } : {}),
      },
      query,
    );
  }

  async get(id: string): Promise<ProposalView> {
    return toView(await this.findOrThrow(id));
  }

  async create(author: AuthUser, input: CreateProposalInput): Promise<ProposalView> {
    if (!(await this.repository.findClient(input.clientId))) {
      throw new BadRequestException({ errors: [{ path: 'clientId', message: 'Unknown client' }] });
    }
    const data = await this.toData(input.clientId, input);
    const row = await this.repository.create(
      { ...data, clientId: input.clientId, createdById: author.id },
      toItems(input.items),
    );
    await this.activity.record(author, {
      action: 'proposal.created',
      targetId: row.id,
      targetLabel: label(row),
    });
    return toView(row);
  }

  async update(author: AuthUser, id: string, input: UpdateProposalInput): Promise<ProposalView> {
    const existing = await this.findOrThrow(id);
    if (existing.status !== 'DRAFT') {
      throw new ConflictException('Only drafts can be edited; duplicate it to make a new version');
    }
    const row = await this.repository.update(
      id,
      await this.toData(existing.clientId, input),
      toItems(input.items),
    );
    await this.activity.record(author, {
      action: 'proposal.updated',
      targetId: id,
      targetLabel: label(row),
    });
    return toView(row);
  }

  /** Sends a draft: the client can see it and is emailed. */
  async send(author: AuthUser, id: string): Promise<ProposalView & { clientNotified: boolean }> {
    const existing = await this.findOrThrow(id);
    if (existing.validUntil && existing.validUntil.toISOString().slice(0, 10) < madridToday()) {
      throw new BadRequestException({
        errors: [{ path: 'validUntil', message: 'The valid-until date has already passed' }],
      });
    }
    const row = await this.repository.transition(id, 'DRAFT', {
      status: 'SENT',
      sentAt: new Date(),
    });
    if (!row) throw new ConflictException('Only drafts can be sent');
    const view = toView(row);
    // Every active person of the client account, each in their language.
    let clientNotified = false;
    for (const person of await this.accounts.people(row.clientId)) {
      try {
        await this.mail.send(
          proposalSentEmail(
            person,
            view,
            `${this.config.siteUrl}/${person.locale}/portal/proposals/${row.id}`,
            person.locale,
            this.config.siteUrl,
          ),
        );
        clientNotified = true;
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.error(`Proposal email to ${person.email} failed: ${reason}`);
      }
    }
    await this.activity.record(author, {
      action: 'proposal.sent',
      targetId: id,
      targetLabel: label(row),
    });
    return { ...view, clientNotified };
  }

  /** Takes a sent proposal back; the client still sees it, marked as withdrawn. */
  async withdraw(author: AuthUser, id: string): Promise<ProposalView> {
    await this.findOrThrow(id);
    const row = await this.repository.transition(id, 'SENT', { status: 'WITHDRAWN' });
    if (!row)
      throw new ConflictException('Only sent proposals that have no answer can be withdrawn');
    await this.activity.record(author, {
      action: 'proposal.withdrawn',
      targetId: id,
      targetLabel: label(row),
    });
    return toView(row);
  }

  /** A new draft with the same content: how a sent proposal gets a new version. */
  async duplicate(author: AuthUser, id: string): Promise<ProposalView> {
    const source = await this.findOrThrow(id);
    const row = await this.repository.create(
      {
        clientId: source.clientId,
        createdById: author.id,
        title: source.title,
        summary: source.summary,
        terms: source.terms,
        validUntil: null,
        projectId: source.projectId,
      },
      source.items.map(({ description, quantity, unitPrice }) => ({
        description,
        quantity,
        unitPrice,
      })),
    );
    await this.activity.record(author, {
      action: 'proposal.created',
      targetId: row.id,
      targetLabel: label(row),
      details: { copyOf: source.number },
    });
    return toView(row);
  }

  /** Only drafts: what the client has seen stays on record. */
  async delete(author: AuthUser, id: string): Promise<void> {
    const existing = await this.findOrThrow(id);
    if (existing.status !== 'DRAFT') throw new ConflictException('Only drafts can be deleted');
    await this.repository.delete(id);
    await this.activity.record(author, {
      action: 'proposal.deleted',
      targetLabel: label(existing),
    });
  }

  // ---- Helpers --------------------------------------------------------------------------

  private async listWhere(
    where: Prisma.ProposalWhereInput,
    query: ListProposalsQuery,
  ): Promise<Paginated<ProposalView>> {
    const { skip, take } = pageToSkipTake(query.page, query.pageSize);
    const { items, total } = await this.repository.list(where, skip, take);
    const today = madridToday();
    return paginate(
      items.map((row) => toView(row, today)),
      total,
      query.page,
      query.pageSize,
    );
  }

  private assertOpen(view: ProposalView): void {
    if (view.status !== 'SENT') throw new ConflictException('This proposal is not open');
    if (view.expired) throw new ConflictException('This proposal has expired');
  }

  private async toData(clientId: string, input: UpdateProposalInput): Promise<ProposalData> {
    const projectId = input.projectId ?? null;
    if (projectId && !(await this.repository.findClientProject(clientId, projectId))) {
      throw new BadRequestException({
        errors: [{ path: 'projectId', message: "Not one of the client's projects" }],
      });
    }
    return {
      title: input.title,
      summary: input.summary,
      terms: input.terms || null,
      validUntil: input.validUntil ? new Date(`${input.validUntil}T00:00:00Z`) : null,
      projectId,
    };
  }

  /** Clients only see their own proposals, and never drafts; admins may look at any. */
  private async findForClient(caller: AuthUser, id: string): Promise<ProposalRow> {
    const row = await this.repository.findById(id);
    const visible =
      row &&
      row.status !== 'DRAFT' &&
      (caller.role === 'ADMIN' || row.clientId === accountOf(caller));
    if (!visible) throw new NotFoundException('Proposal not found');
    return row;
  }

  private async findOrThrow(id: string): Promise<ProposalRow> {
    const row = await this.repository.findById(id);
    if (!row) throw new NotFoundException('Proposal not found');
    return row;
  }

  private async answered(
    caller: AuthUser,
    row: ProposalRow,
    answer: { kind: 'accepted'; name: string } | { kind: 'declined'; reason: string | null },
  ): Promise<ProposalView> {
    const view = toView(row);
    this.notify(
      proposalAnsweredEmail(
        this.config.leadsNotifyTo,
        { name: caller.name, email: caller.email },
        view,
        answer,
        `${this.config.siteUrl}/es/admin/proposals/${row.id}`,
        this.config.siteUrl,
      ),
    );
    await this.activity.record(caller, {
      action: answer.kind === 'accepted' ? 'proposal.accepted' : 'proposal.declined',
      targetId: row.id,
      targetLabel: label(row),
    });
    return view;
  }

  private notify(message: MailMessage): void {
    this.mail.send(message).catch((error: unknown) => {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Proposal email to ${message.to} failed: ${reason}`);
    });
  }
}

function toItems(items: CreateProposalInput['items']): ItemData[] {
  return items.map(({ description, quantity, unitPrice }) => ({
    description,
    quantity,
    unitPrice,
  }));
}
