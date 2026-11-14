import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import { linksQuerySchema, type LinksQuery } from './link-checks.schemas.js';
import { LinkChecksService, type LinkList, type LinkView } from './link-checks.service.js';

/** Admin → Content → Broken links (architecture 4.6). */
@ApiTags('admin/links')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/links')
export class LinkChecksController {
  constructor(private readonly links: LinkChecksService) {}

  @Get()
  list(@Query({ schema: linksQuerySchema }) query: LinksQuery): Promise<LinkList> {
    return this.links.list(query.status);
  }

  /** "Check again": one link, now. Each check may request another site. */
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':id/check')
  @HttpCode(HttpStatus.OK)
  check(@Param({ schema: idParamSchema }) params: IdParam): Promise<LinkView> {
    return this.links.check(params.id);
  }
}
