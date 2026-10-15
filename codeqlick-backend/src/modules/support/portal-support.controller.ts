import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Paginated } from '../../common/types/paginated.js';
import {
  createTicketSchema,
  listTicketsQuerySchema,
  ticketMessageSchema,
  type CreateTicketInput,
  type ListTicketsQuery,
  type TicketMessageInput,
} from './support.schemas.js';
import { SupportService, type TicketDetail, type TicketSummary } from './support.service.js';

@ApiTags('portal')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('portal/tickets')
export class PortalSupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listTicketsQuerySchema }) query: ListTicketsQuery,
  ): Promise<Paginated<TicketSummary>> {
    return this.support.listMine(user, query);
  }

  @Post()
  open(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createTicketSchema }) body: CreateTicketInput,
  ): Promise<TicketDetail> {
    return this.support.open(user, body);
  }

  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<TicketDetail> {
    return this.support.getMine(user, params.id);
  }

  @Post(':id/messages')
  reply(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: ticketMessageSchema }) body: TicketMessageInput,
  ): Promise<TicketDetail> {
    return this.support.replyAsClient(user, params.id, body);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  close(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<TicketDetail> {
    return this.support.close(user, params.id);
  }
}
