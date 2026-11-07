import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Paginated } from '../../common/types/paginated.js';
import {
  createProposalSchema,
  listProposalsQuerySchema,
  updateProposalSchema,
  type CreateProposalInput,
  type ListProposalsQuery,
  type UpdateProposalInput,
} from './proposals.schemas.js';
import { ProposalsService, type ProposalView } from './proposals.service.js';

@ApiTags('admin/proposals')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/proposals')
export class AdminProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Get()
  list(
    @Query({ schema: listProposalsQuerySchema }) query: ListProposalsQuery,
  ): Promise<Paginated<ProposalView>> {
    return this.proposals.list(query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createProposalSchema }) body: CreateProposalInput,
  ): Promise<ProposalView> {
    return this.proposals.create(user, body);
  }

  @Get(':id')
  get(@Param({ schema: idParamSchema }) params: IdParam): Promise<ProposalView> {
    return this.proposals.get(params.id);
  }

  @Put(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updateProposalSchema }) body: UpdateProposalInput,
  ): Promise<ProposalView> {
    return this.proposals.update(user, params.id, body);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  send(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<ProposalView & { clientNotified: boolean }> {
    return this.proposals.send(user, params.id);
  }

  @Post(':id/withdraw')
  @HttpCode(HttpStatus.OK)
  withdraw(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<ProposalView> {
    return this.proposals.withdraw(user, params.id);
  }

  @Post(':id/duplicate')
  duplicate(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<ProposalView> {
    return this.proposals.duplicate(user, params.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    await this.proposals.delete(user, params.id);
  }
}
