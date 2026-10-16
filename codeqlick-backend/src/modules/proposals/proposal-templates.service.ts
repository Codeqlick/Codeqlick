import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { ProposalTemplate } from '../../generated/prisma/client.js';
import { ProposalTemplatesRepository } from './proposal-templates.repository.js';
import type { ProposalTemplateInput } from './proposals.schemas.js';
import { ProposalsRepository } from './proposals.repository.js';

export interface ProposalTemplateView {
  id: string;
  name: string;
  title: string;
  summary: string;
  terms: string | null;
  validDays: number | null;
  items: Array<{ description: string; quantity: number; unitPrice: number }>;
  updatedAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function toView(row: ProposalTemplate): ProposalTemplateView {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    summary: row.summary,
    terms: row.terms,
    validDays: row.validDays,
    items: row.items as ProposalTemplateView['items'],
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Proposal templates: a new proposal can start from one; any proposal can be saved as one. */
@Injectable()
export class ProposalTemplatesService {
  constructor(
    private readonly templates: ProposalTemplatesRepository,
    private readonly proposals: ProposalsRepository,
  ) {}

  async list(): Promise<ProposalTemplateView[]> {
    return (await this.templates.list()).map(toView);
  }

  async create(input: ProposalTemplateInput): Promise<ProposalTemplateView> {
    return toView(await this.templates.save(this.data(input)));
  }

  async update(id: string, input: ProposalTemplateInput): Promise<ProposalTemplateView> {
    await this.findOrThrow(id);
    try {
      return toView(await this.templates.update(id, this.data(input)));
    } catch {
      throw new ConflictException('Another template already has that name');
    }
  }

  async delete(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.templates.delete(id);
  }

  /** The proposal's content under `name`; its validity becomes a number of days. */
  async fromProposal(proposalId: string, name: string): Promise<ProposalTemplateView> {
    const proposal = await this.proposals.findById(proposalId);
    if (!proposal) throw new NotFoundException('Proposal not found');
    const validDays = proposal.validUntil
      ? Math.max(
          1,
          Math.round((proposal.validUntil.getTime() - proposal.createdAt.getTime()) / DAY_MS),
        )
      : null;
    return toView(
      await this.templates.save({
        name,
        title: proposal.title,
        summary: proposal.summary,
        terms: proposal.terms,
        validDays: validDays && validDays <= 365 ? validDays : null,
        items: proposal.items.map(({ description, quantity, unitPrice }) => ({
          description,
          quantity,
          unitPrice,
        })),
      }),
    );
  }

  private data(input: ProposalTemplateInput) {
    return {
      name: input.name,
      title: input.title,
      summary: input.summary,
      terms: input.terms ?? null,
      validDays: input.validDays ?? null,
      items: input.items,
    };
  }

  private async findOrThrow(id: string): Promise<ProposalTemplate> {
    const row = await this.templates.find(id);
    if (!row) throw new NotFoundException('Template not found');
    return row;
  }
}
