import { Injectable } from '@nestjs/common';
import { SitePurchaseStatus, type Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const withProject = {
  project: { select: { id: true, name: true, clientId: true } },
} satisfies Prisma.ProjectInvoiceInclude;

export type InvoiceRow = Prisma.ProjectInvoiceGetPayload<{ include: typeof withProject }>;

export type PurchaseRow = Prisma.SitePurchaseGetPayload<{
  select: {
    id: true;
    amountCents: true;
    currency: true;
    paidAt: true;
    stripeInvoiceId: true;
    project: { select: { id: true; name: true; clientId: true } };
  };
}>;

const purchaseSelect = {
  id: true,
  amountCents: true,
  currency: true,
  paidAt: true,
  stripeInvoiceId: true,
  project: { select: { id: true, name: true, clientId: true } },
} satisfies Prisma.SitePurchaseSelect;

/** The team's invoices of projects, and the paid purchases Stripe invoiced (decisions 20, 23). */
@Injectable()
export class InvoicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findProject(id: string) {
    return this.prisma.clientProject.findUnique({
      where: { id },
      select: { id: true, name: true, clientId: true },
    });
  }

  listForProject(projectId: string): Promise<InvoiceRow[]> {
    return this.prisma.projectInvoice.findMany({
      where: { projectId },
      include: withProject,
      orderBy: [{ issuedOn: 'desc' }, { createdAt: 'desc' }],
    });
  }

  listForAccount(accountId: string): Promise<InvoiceRow[]> {
    return this.prisma.projectInvoice.findMany({
      where: { project: { clientId: accountId } },
      include: withProject,
      orderBy: [{ issuedOn: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** Paid purchases of the account's projects that Stripe invoiced. */
  purchasesForAccount(accountId: string): Promise<PurchaseRow[]> {
    return this.prisma.sitePurchase.findMany({
      where: {
        status: SitePurchaseStatus.PAID,
        stripeInvoiceId: { not: null },
        project: { clientId: accountId },
      },
      select: purchaseSelect,
      orderBy: { paidAt: 'desc' },
    });
  }

  findPurchase(id: string): Promise<PurchaseRow | null> {
    return this.prisma.sitePurchase.findUnique({ where: { id }, select: purchaseSelect });
  }

  findById(id: string): Promise<InvoiceRow | null> {
    return this.prisma.projectInvoice.findUnique({ where: { id }, include: withProject });
  }

  numberTaken(number: string): Promise<boolean> {
    return this.prisma.projectInvoice.count({ where: { number } }).then((count) => count > 0);
  }

  create(data: Prisma.ProjectInvoiceUncheckedCreateInput): Promise<InvoiceRow> {
    return this.prisma.projectInvoice.create({ data, include: withProject });
  }

  setPaid(id: string, paidAt: Date | null): Promise<InvoiceRow> {
    return this.prisma.projectInvoice.update({
      where: { id },
      data: { paidAt },
      include: withProject,
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.projectInvoice.delete({ where: { id } });
  }
}
