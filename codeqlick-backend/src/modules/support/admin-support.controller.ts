import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Paginated } from '../../common/types/paginated.js';
import {
  adminTicketMessageSchema,
  listTicketsQuerySchema,
  ticketFileParamSchema,
  type TicketFileParam,
  updateTicketSchema,
  type AdminTicketMessageInput,
  type ListTicketsQuery,
  type UpdateTicketInput,
} from './support.schemas.js';
import { SupportService, type TicketDetail, type TicketSummary } from './support.service.js';

@ApiTags('admin/tickets')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/tickets')
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get()
  list(
    @Query({ schema: listTicketsQuerySchema }) query: ListTicketsQuery,
  ): Promise<Paginated<TicketSummary>> {
    return this.support.list(query);
  }

  @Get(':id')
  get(@Param({ schema: idParamSchema }) params: IdParam): Promise<TicketDetail> {
    return this.support.get(params.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updateTicketSchema }) body: UpdateTicketInput,
  ): Promise<TicketDetail> {
    return this.support.update(user, params.id, body);
  }

  @Post(':id/messages')
  reply(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: adminTicketMessageSchema }) body: AdminTicketMessageInput,
  ): Promise<TicketDetail> {
    return this.support.replyAsTeam(user, params.id, body);
  }

  @Delete(':id/files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFile(
    @CurrentUser() user: AuthUser,
    @Param({ schema: ticketFileParamSchema }) params: TicketFileParam,
  ): Promise<void> {
    await this.support.deleteFile(user, params.id, params.fileId);
  }
}
