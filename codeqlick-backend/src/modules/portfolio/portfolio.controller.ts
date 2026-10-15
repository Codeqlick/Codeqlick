import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  localeQuerySchema,
  slugParamSchema,
  type LocaleQuery,
  type SlugParam,
} from '../../common/schemas/common.schemas.js';
import type { Paginated } from '../../common/types/paginated.js';
import {
  listPublicPortfolioQuerySchema,
  type ListPublicPortfolioQuery,
} from './portfolio.schemas.js';
import {
  PortfolioService,
  type PortfolioDetail,
  type PortfolioFilters,
  type PortfolioSummary,
} from './portfolio.service.js';

@ApiTags('portfolio')
@Public()
@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  list(
    @Query({ schema: listPublicPortfolioQuerySchema }) query: ListPublicPortfolioQuery,
  ): Promise<Paginated<PortfolioSummary>> {
    return this.portfolio.listPublished(query);
  }

  /** Declared before ':slug' so "filters" isn't read as a slug. */
  @Get('filters')
  filters(): Promise<PortfolioFilters> {
    return this.portfolio.filters();
  }

  @Get(':slug')
  get(
    @Param({ schema: slugParamSchema }) params: SlugParam,
    @Query({ schema: localeQuerySchema }) query: LocaleQuery,
  ): Promise<PortfolioDetail> {
    return this.portfolio.getPublishedBySlug(params.slug, query.locale);
  }
}
