import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  SupportTicket,
  TicketAttachment,
  TicketMessage,
  TicketPriority,
  TicketStatus,
  TicketType,
  User,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

type Person = Pick<User, 'id' | 'name' | 'email' | 'role' | 'locale' | 'isActive'>;
export type MessageWithAuthor = TicketMessage & { author: Pick<User, 'name' | 'role'> | null };
export type TicketSummaryRow = SupportTicket & {
  client: Person;
  project: { id: string; name: string } | null;
};
export type AttachmentWithUploader = TicketAttachment & {
  uploadedBy: Pick<User, 'name' | 'role'> | null;
};
export type TicketDetailRow = TicketSummaryRow & {
  messages: MessageWithAuthor[];
  files: AttachmentWithUploader[];
};

const personSelect = {
  select: { id: true, name: true, email: true, role: true, locale: true, isActive: true },
} as const;
const projectSelect = { select: { id: true, name: true } } as const;
const messagesInclude = {
  orderBy: { createdAt: 'asc' },
  include: { author: { select: { name: true, role: true } } },
} as const;

const filesInclude = {
  orderBy: { createdAt: 'asc' },
  include: { uploadedBy: { select: { name: true, role: true } } },
} as const;
const detailInclude = {
  client: personSelect,
  project: projectSelect,
  messages: messagesInclude,
  files: filesInclude,
} as const;

const OPEN_STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_CLIENT'];

@Injectable()
export class SupportRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    filter: { clientId?: string; status?: TicketStatus; active?: boolean },
    skip: number,
    take: number,
  ): Promise<{ items: TicketSummaryRow[]; total: number }> {
    const where: Prisma.SupportTicketWhereInput = {};
    if (filter.clientId) where.clientId = filter.clientId;
    if (filter.status) where.status = filter.status;
    else if (filter.active) where.status = { in: OPEN_STATUSES };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        include: { client: personSelect, project: projectSelect },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string): Promise<TicketDetailRow | null> {
    return this.prisma.supportTicket.findUnique({
      where: { id },
      include: detailInclude,
    });
  }

  findClientProject(clientId: string, projectId: string) {
    return this.prisma.clientProject.findFirst({
      where: { id: projectId, clientId },
      select: { id: true },
    });
  }

  /** Opens a request with its description as the first message. */
  create(data: {
    clientId: string;
    projectId: string | null;
    type: TicketType;
    priority: TicketPriority;
    title: string;
    body: string;
  }): Promise<TicketDetailRow> {
    const { body, ...ticket } = data;
    return this.prisma.supportTicket.create({
      data: { ...ticket, messages: { create: { authorId: data.clientId, body } } },
      include: detailInclude,
    });
  }

  /** Adds a message and, when given, changes the status (keeping `resolvedAt` in step). */
  async addMessage(
    ticketId: string,
    authorId: string,
    body: string,
    status?: TicketStatus,
  ): Promise<TicketDetailRow> {
    return this.prisma.$transaction(async (tx) => {
      await tx.ticketMessage.create({ data: { ticketId, authorId, body } });
      await tx.supportTicket.update({
        where: { id: ticketId },
        data: { updatedAt: new Date(), ...(status ? statusData(status) : {}) },
      });
      return tx.supportTicket.findUniqueOrThrow({
        where: { id: ticketId },
        include: detailInclude,
      });
    });
  }

  update(
    id: string,
    data: { status?: TicketStatus; priority?: TicketPriority },
  ): Promise<TicketDetailRow> {
    return this.prisma.supportTicket.update({
      where: { id },
      data: {
        ...(data.priority ? { priority: data.priority } : {}),
        ...(data.status ? statusData(data.status) : {}),
      },
      include: detailInclude,
    });
  }

  /** Adds a file and counts it as activity on the request. */
  async addFile(data: {
    id: string;
    ticketId: string;
    uploadedById: string;
    name: string;
    contentType: string;
    size: number;
  }): Promise<TicketAttachment> {
    const [file] = await this.prisma.$transaction([
      this.prisma.ticketAttachment.create({ data }),
      this.prisma.supportTicket.update({
        where: { id: data.ticketId },
        data: { updatedAt: new Date() },
      }),
    ]);
    return file;
  }

  findFile(ticketId: string, fileId: string): Promise<TicketAttachment | null> {
    return this.prisma.ticketAttachment.findFirst({ where: { id: fileId, ticketId } });
  }

  async deleteFile(id: string): Promise<void> {
    await this.prisma.ticketAttachment.delete({ where: { id } });
  }

  countActive(): Promise<number> {
    return this.prisma.supportTicket.count({ where: { status: { in: OPEN_STATUSES } } });
  }
}

/** A status change; `resolvedAt` is set when it gets resolved or closed, cleared if reopened. */
function statusData(status: TicketStatus): Prisma.SupportTicketUpdateInput {
  const done = status === 'RESOLVED' || status === 'CLOSED';
  return done ? { status, resolvedAt: new Date() } : { status, resolvedAt: null };
}
