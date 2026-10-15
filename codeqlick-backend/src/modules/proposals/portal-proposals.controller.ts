import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Paginated } from '../../common/types/paginated.js';
import {
  acceptProposalSchema,
  declineProposalSchema,
  listProposalsQuerySchema,
  type AcceptProposalInput,
  type DeclineProposalInput,
  type ListProposalsQuery,
} from './proposals.schemas.js';
import { ProposalsService, type ProposalView } from './proposals.service.js';

@ApiTags('portal')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('portal/proposals')
export class PortalProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listProposalsQuerySchema }) query: ListProposalsQuery,
  ): Promise<Paginated<ProposalView>> {
    return this.proposals.listMine(user, query);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<ProposalView> {
    return this.proposals.getMine(user, params.id);
  }

  @Post(':id/accept')
  @HttpCode(HttpStatus.OK)
  accept(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: acceptProposalSchema }) body: AcceptProposalInput,
  ): Promise<ProposalView> {
    return this.proposals.accept(user, params.id, body);
  }

  @Post(':id/decline')
  @HttpCode(HttpStatus.OK)
  decline(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: declineProposalSchema }) body: DeclineProposalInput,
  ): Promise<ProposalView> {
    return this.proposals.decline(user, params.id, body);
  }
}
