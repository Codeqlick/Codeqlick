import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { Paginated } from '../../common/types/paginated.js';
import {
  listLeadsQuerySchema,
  updateLeadSchema,
  type ListLeadsQuery,
  type UpdateLeadInput,
} from './leads.schemas.js';
import { LeadsService, type Lead } from './leads.service.js';

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

  @Get(':id')
  get(@Param({ schema: idParamSchema }) params: IdParam): Promise<Lead> {
    return this.leads.get(params.id);
  }

  @Patch(':id')
  update(
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updateLeadSchema }) body: UpdateLeadInput,
  ): Promise<Lead> {
    return this.leads.update(params.id, body);
  }
}
