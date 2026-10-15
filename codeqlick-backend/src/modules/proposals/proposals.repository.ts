import { Injectable } from '@nestjs/common';
import type {
  Prisma,
  Proposal,
  ProposalItem,
  ProposalStatus,
  User,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

type Person = Pick<User, 'id' | 'name' | 'email' | 'locale' | 'isActive'>;
export type ProposalRow = Proposal & {
  client: Person;
  project: { id: string; name: string } | null;
  items: ProposalItem[];
};

const include = {
  client: { select: { id: true, name: true, email: true, locale: true, isActive: true } },
  project: { select: { id: true, name: true } },
  items: { orderBy: { position: 'asc' } },
} as const;

export type ItemData = { description: string; quantity: number; unitPrice: number };
export type ProposalData = {
  title: string;
  summary: string;
  terms: string | null;
  validUntil: Date | null;
  projectId: string | null;
};

const itemsCreate = (items: ItemData[]) => ({
  create: items.map((item, position) => ({ ...item, position })),
});

@Injectable()
export class ProposalsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    where: Prisma.ProposalWhereInput,
    skip: number,
    take: number,
  ): Promise<{ items: ProposalRow[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.proposal.findMany({ where, include, orderBy: { updatedAt: 'desc' }, skip, take }),
      this.prisma.proposal.count({ where }),
    ]);
    return { items, total };
  }

  findById(id: string): Promise<ProposalRow | null> {
    return this.prisma.proposal.findUnique({ where: { id }, include });
  }

  findClient(id: string) {
    // The company's main account, not one of its people.
    return this.prisma.user.findFirst({
      where: { id, role: 'CLIENT', memberOfId: null },
      select: { id: true },
    });
  }

  findClientProject(clientId: string, projectId: string) {
    return this.prisma.clientProject.findFirst({
      where: { id: projectId, clientId },
      select: { id: true },
    });
  }

  create(
    data: ProposalData & { clientId: string; createdById: string },
    items: ItemData[],
  ): Promise<ProposalRow> {
    return this.prisma.proposal.create({
      data: { ...data, items: itemsCreate(items) },
      include,
    });
  }

  /** Replaces the fields and the items of a draft. */
  update(id: string, data: ProposalData, items: ItemData[]): Promise<ProposalRow> {
    return this.prisma.$transaction(async (tx) => {
      await tx.proposalItem.deleteMany({ where: { proposalId: id } });
      return tx.proposal.update({
        where: { id },
        data: { ...data, items: itemsCreate(items) },
        include,
      });
    });
  }

  /**
   * Moves it from `from` to another status; null when it wasn't in `from` any more (someone else
   * got there first), so a double click can't accept and decline it.
   */
  async transition(
    id: string,
    from: ProposalStatus,
    data: Prisma.ProposalUpdateManyMutationInput & { status: ProposalStatus },
  ): Promise<ProposalRow | null> {
    const { count } = await this.prisma.proposal.updateMany({ where: { id, status: from }, data });
    return count === 0 ? null : this.findById(id);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.proposal.delete({ where: { id } });
  }
}
