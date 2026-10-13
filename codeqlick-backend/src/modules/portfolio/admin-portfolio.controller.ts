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
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { Paginated } from '../../common/types/paginated.js';
import {
  createPortfolioSchema,
  listAdminPortfolioQuerySchema,
  updatePortfolioSchema,
  type CreatePortfolioInput,
  type ListAdminPortfolioQuery,
  type UpdatePortfolioInput,
} from './portfolio.schemas.js';
import { PortfolioService, type AdminPortfolioItem } from './portfolio.service.js';

@ApiTags('admin/portfolio')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/portfolio')
export class AdminPortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  list(
    @Query({ schema: listAdminPortfolioQuerySchema }) query: ListAdminPortfolioQuery,
  ): Promise<Paginated<AdminPortfolioItem>> {
    return this.portfolio.listAll(query);
  }

  @Post()
  create(
    @Body({ schema: createPortfolioSchema }) body: CreatePortfolioInput,
  ): Promise<AdminPortfolioItem> {
    return this.portfolio.create(body);
  }

  @Get(':id')
  get(@Param({ schema: idParamSchema }) params: IdParam): Promise<AdminPortfolioItem> {
    return this.portfolio.get(params.id);
  }

  @Patch(':id')
  update(
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updatePortfolioSchema }) body: UpdatePortfolioInput,
  ): Promise<AdminPortfolioItem> {
    return this.portfolio.update(params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param({ schema: idParamSchema }) params: IdParam): Promise<void> {
    await this.portfolio.delete(params.id);
  }
}
