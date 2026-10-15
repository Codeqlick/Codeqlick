import { Body, Controller, Get, Header, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Paginated } from '../../common/types/paginated.js';
import {
  convertLeadSchema,
  createLeadReplySchema,
  exportLeadsQuerySchema,
  listLeadsQuerySchema,
  updateLeadSchema,
  type ConvertLeadInput,
  type CreateLeadReplyInput,
  type ExportLeadsQuery,
  type ListLeadsQuery,
  type UpdateLeadInput,
} from './leads.schemas.js';
import {
  LeadsService,
  type ConvertedLead,
  type Lead,
  type LeadReply,
  type SentLeadReply,
} from './leads.service.js';

@ApiTags('admin/leads')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/leads')
export class AdminLeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  list(@Query({ schema: listLeadsQuerySchema }) query: ListLeadsQuery): Promise<Paginated<Lead>> {
    return this.leads.list(query);
  }

  /** Declared before `:id` so the path isn't read as an id. */
  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="codeqlick-leads.csv"')
  @Header('Cache-Control', 'no-store')
  exportCsv(@Query({ schema: exportLeadsQuerySchema }) query: ExportLeadsQuery): Promise<string> {
    return this.leads.exportCsv(query);
  }

  @Get(':id')
  get(@Param({ schema: idParamSchema }) params: IdParam): Promise<Lead> {
    return this.leads.get(params.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updateLeadSchema }) body: UpdateLeadInput,
  ): Promise<Lead> {
    return this.leads.update(user, params.id, body);
  }

  @Post(':id/convert')
  convert(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: convertLeadSchema }) body: ConvertLeadInput,
  ): Promise<ConvertedLead> {
    return this.leads.convert(user, params.id, body);
  }

  @Get(':id/replies')
  listReplies(@Param({ schema: idParamSchema }) params: IdParam): Promise<LeadReply[]> {
    return this.leads.listReplies(params.id);
  }

  @Post(':id/replies')
  reply(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createLeadReplySchema }) body: CreateLeadReplyInput,
  ): Promise<SentLeadReply> {
    return this.leads.reply(user, params.id, body);
  }
}
