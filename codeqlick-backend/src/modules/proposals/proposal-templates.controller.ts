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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import {
  proposalTemplateSchema,
  saveAsTemplateSchema,
  type ProposalTemplateInput,
  type SaveAsTemplateInput,
} from './proposals.schemas.js';
import {
  ProposalTemplatesService,
  type ProposalTemplateView,
} from './proposal-templates.service.js';

@ApiTags('admin/proposals')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class ProposalTemplatesController {
  constructor(private readonly templates: ProposalTemplatesService) {}

  @Get('proposal-templates')
  list(): Promise<ProposalTemplateView[]> {
    return this.templates.list();
  }

  @Post('proposal-templates')
  create(@Body({ schema: proposalTemplateSchema }) body: ProposalTemplateInput) {
    return this.templates.create(body);
  }

  @Put('proposal-templates/:id')
  update(
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: proposalTemplateSchema }) body: ProposalTemplateInput,
  ): Promise<ProposalTemplateView> {
    return this.templates.update(params.id, body);
  }

  @Delete('proposal-templates/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param({ schema: idParamSchema }) params: IdParam): Promise<void> {
    return this.templates.delete(params.id);
  }

  @Post('proposals/:id/template')
  @HttpCode(HttpStatus.OK)
  saveAs(
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: saveAsTemplateSchema }) body: SaveAsTemplateInput,
  ): Promise<ProposalTemplateView> {
    return this.templates.fromProposal(params.id, body.name);
  }
}
