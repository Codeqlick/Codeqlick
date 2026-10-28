import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../../common/types/auth-user.js';
import { emailOf, LeadsService } from '../leads/leads.service.js';
import { madridToday, ProposalsService } from '../proposals/proposals.service.js';
import { UsersService } from '../users/users.service.js';
import { proposalFromRequest } from './site-proposal.js';
import { siteRequestSchema } from './site-request.js';

export interface RequestProposalResult {
  proposalId: string;
  client: { id: string; created: boolean; registered: boolean; invitationSent?: boolean };
}

/** "Preparar propuesta" on a basic-website lead (architecture 8.2). */
@Injectable()
export class SiteProposalsService {
  constructor(
    private readonly leads: LeadsService,
    private readonly users: UsersService,
    private readonly proposals: ProposalsService,
  ) {}

  /**
   * Drafts the proposal for a website request: for the email's client account (prepared
   * unregistered, without any email, when missing), linked to the lead, which moves to PROPOSAL.
   */
  async draft(actor: AuthUser, leadId: string, now = new Date()): Promise<RequestProposalResult> {
    const lead = await this.leads.get(leadId);
    const stored = siteRequestSchema
      .pick({ preset: true, business: true, domain: true })
      .safeParse(lead.siteRequest);
    if (!stored.success) {
      throw new BadRequestException('This lead did not come from a website request');
    }
    if (lead.proposalId) throw new ConflictException('This lead already has a proposal');
    // No email yet: sending the proposal invites them to create the account (decision 17).
    const client = await this.users.findOrCreateClient(
      actor,
      { email: emailOf(lead), name: lead.name, locale: lead.locale },
      null,
    );
    const proposal = await this.proposals.create(actor, {
      clientId: client.id,
      ...proposalFromRequest(stored.data, lead.locale, madridToday(now)),
    });
    await this.leads.linkProposal(leadId, proposal.id);
    return { proposalId: proposal.id, client };
  }
}
