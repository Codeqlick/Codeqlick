import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { adminSearchQuerySchema, type AdminSearchQuery } from './search.schemas.js';
import { SearchService, type AdminSearch } from './search.service.js';

@ApiTags('admin/search')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/search')
export class AdminSearchController {
  constructor(private readonly search: SearchService) {}

  /** Leads, users, projects, requests, proposals, posts and case studies matching `q`. */
  @Get()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  find(@Query({ schema: adminSearchQuerySchema }) query: AdminSearchQuery): Promise<AdminSearch> {
    return this.search.search(query.q, query.locale);
  }
}
