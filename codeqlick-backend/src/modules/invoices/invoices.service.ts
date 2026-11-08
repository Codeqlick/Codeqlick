import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import { AppConfigService } from '../../config/app-config.service.js';
import { accountOf, type AuthUser } from '../../common/types/auth-user.js';
import { AccountsService } from '../accounts/accounts.service.js';
import { ActivityService } from '../activity/activity.service.js';
import { MailService } from '../mail/mail.service.js';
import { StripeClient } from '../managed-sites/stripe.client.js';
import { cleanFileName } from '../projects/project-file-name.js';
import type { UploadedProjectFile } from '../projects/projects.service.js';
import { invoiceAddedEmail } from './invoice-emails.js';
import { InvoiceFilesStorage } from './invoice-files.storage.js';
import type { CreateInvoiceInput } from './invoices.schemas.js';
import { InvoicesRepository, type InvoiceRow, type PurchaseRow } from './invoices.repository.js';

/** Largest invoice PDF accepted, in bytes. */
export const MAX_INVOICE_BYTES = 10 * 1024 * 1024;

export type InvoiceStatus = 'PAID' | 'DUE' | 'OVERDUE';

export interface InvoiceView {
  id: string;
  source: 'team' | 'stripe';
  number: string | null;
  issuedOn: string;
  dueOn: string | null;
  amountCents: number;
  currency: string;
  status: InvoiceStatus;
  paidAt: string | null;
  project: { id: string; name: string } | null;
}

export interface InvoiceDownload {
  stream: ReadStream;
  name: string;
  size: number;
}

const day = (date: Date): string => date.toISOString().slice(0, 10);

/** Paid once marked; overdue from the day after `dueOn`. */
export function invoiceStatus(
  invoice: { paidAt: Date | null; dueOn: Date | null },
  now: Date,
): InvoiceStatus {
  if (invoice.paidAt) return 'PAID';
  if (invoice.dueOn && day(invoice.dueOn) < day(now)) return 'OVERDUE';
  return 'DUE';
}

function toView(row: InvoiceRow, now: Date): InvoiceView {
  return {
    id: row.id,
    source: 'team',
    number: row.number,
    issuedOn: day(row.issuedOn),
    dueOn: row.dueOn ? day(row.dueOn) : null,
    amountCents: row.amountCents,
    currency: row.currency,
    status: invoiceStatus(row, now),
    paidAt: row.paidAt?.toISOString() ?? null,
    project: { id: row.project.id, name: row.project.name },
  };
}

function purchaseView(row: PurchaseRow): InvoiceView {
  const paidAt = row.paidAt ?? new Date(0);
  return {
    id: row.id,
    source: 'stripe',
    number: null,
    issuedOn: day(paidAt),
    dueOn: null,
    amountCents: row.amountCents,
    currency: row.currency,
    status: 'PAID',
    paidAt: paidAt.toISOString(),
    project: row.project ? { id: row.project.id, name: row.project.name } : null,
  };
}

/** Invoices in the portal: the team's, uploaded as PDFs, and Stripe's (decisions 20, 23). */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly repository: InvoicesRepository,
    private readonly storage: InvoiceFilesStorage,
    private readonly stripe: StripeClient,
    private readonly accounts: AccountsService,
    private readonly activity: ActivityService,
    private readonly mail: MailService,
    private readonly config: AppConfigService,
  ) {}

  async listForProject(projectId: string): Promise<InvoiceView[]> {
    await this.projectOrThrow(projectId);
    const now = new Date();
    return (await this.repository.listForProject(projectId)).map((row) => toView(row, now));
  }

  async listForCaller(caller: AuthUser): Promise<InvoiceView[]> {
    const account = accountOf(caller);
    const now = new Date();
    const [team, purchases] = await Promise.all([
      this.repository.listForAccount(account),
      this.repository.purchasesForAccount(account),
    ]);
    return [...team.map((row) => toView(row, now)), ...purchases.map(purchaseView)].toSorted(
      (a, b) => b.issuedOn.localeCompare(a.issuedOn),
    );
  }

  async create(
    actor: AuthUser,
    projectId: string,
    input: CreateInvoiceInput,
    upload: UploadedProjectFile | undefined,
  ): Promise<InvoiceView> {
    if (!upload || upload.buffer.length === 0) {
      throw new BadRequestException('Send the PDF in a multipart field called "file"');
    }
    if (upload.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new BadRequestException('The invoice must be a PDF');
    }
    const project = await this.projectOrThrow(projectId);
    if (await this.repository.numberTaken(input.number)) {
      throw new ConflictException('An invoice with this number exists');
    }

    const id = randomUUID();
    await this.storage.write(id, upload.buffer);
    let row: InvoiceRow;
    try {
      row = await this.repository.create({
        id,
        projectId,
        number: input.number,
        issuedOn: new Date(`${input.issuedOn}T00:00:00Z`),
        dueOn: input.dueOn ? new Date(`${input.dueOn}T00:00:00Z`) : null,
        amountCents: input.amount,
        fileName: cleanFileName(upload.originalname ?? `${input.number}.pdf`),
        size: upload.buffer.length,
        uploadedById: actor.id,
      });
    } catch (error) {
      await this.storage.remove(id);
      throw error;
    }
    await this.activity.record(actor, {
      action: 'project.invoice_added',
      targetId: projectId,
      targetLabel: project.name,
      details: { invoice: row.number },
    });
    const view = toView(row, new Date());
    if (input.notify) await this.notify(project, view);
    return view;
  }

  async setPaid(actor: AuthUser, id: string, paid: boolean): Promise<InvoiceView> {
    const invoice = await this.invoiceOrThrow(id);
    // Marking it paid again keeps the first date.
    const paidAt = paid ? (invoice.paidAt ?? new Date()) : null;
    const row = await this.repository.setPaid(id, paidAt);
    if (Boolean(invoice.paidAt) !== paid) {
      await this.activity.record(actor, {
        action: paid ? 'project.invoice_paid' : 'project.invoice_unpaid',
        targetId: invoice.project.id,
        targetLabel: invoice.project.name,
        details: { invoice: invoice.number },
      });
    }
    return toView(row, new Date());
  }

  async delete(actor: AuthUser, id: string): Promise<void> {
    const invoice = await this.invoiceOrThrow(id);
    await this.repository.delete(id);
    await this.storage.remove(id);
    await this.activity.record(actor, {
      action: 'project.invoice_deleted',
      targetId: invoice.project.id,
      targetLabel: invoice.project.name,
      details: { invoice: invoice.number },
    });
  }

  async download(caller: AuthUser, id: string): Promise<InvoiceDownload> {
    const invoice = await this.repository.findById(id);
    if (!invoice || !this.mayRead(caller, invoice.project.clientId)) {
      throw new NotFoundException('Invoice not found');
    }
    return { stream: this.storage.read(invoice.id), name: invoice.fileName, size: invoice.size };
  }

  /** The PDF of Stripe's invoice, asked to Stripe now: its links don't last. */
  async stripePdf(caller: AuthUser, purchaseId: string): Promise<{ url: string }> {
    const purchase = await this.repository.findPurchase(purchaseId);
    if (
      !purchase?.stripeInvoiceId ||
      !purchase.project ||
      !this.mayRead(caller, purchase.project.clientId)
    ) {
      throw new NotFoundException('Invoice not found');
    }
    const url = await this.stripe.invoicePdf(purchase.stripeInvoiceId);
    if (!url) throw new NotFoundException('Invoice not found');
    return { url };
  }

  private mayRead(caller: AuthUser, clientId: string): boolean {
    return caller.role === 'ADMIN' || clientId === accountOf(caller);
  }

  private async notify(
    project: { id: string; name: string; clientId: string },
    invoice: InvoiceView,
  ): Promise<void> {
    const people = await this.accounts.people(project.clientId);
    const results = await Promise.allSettled(
      people.map((person) =>
        this.mail.send(
          invoiceAddedEmail(
            person,
            project,
            { ...invoice, number: invoice.number ?? '' },
            `${this.config.siteUrl}/${person.locale}/portal/invoices`,
            person.locale,
            this.config.siteUrl,
          ),
        ),
      ),
    );
    for (const result of results) {
      if (result.status === 'rejected') {
        const reason =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
        this.logger.error(`Failed to email an invoice: ${reason}`);
      }
    }
  }

  private async projectOrThrow(id: string) {
    const project = await this.repository.findProject(id);
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async invoiceOrThrow(id: string): Promise<InvoiceRow> {
    const invoice = await this.repository.findById(id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }
}
