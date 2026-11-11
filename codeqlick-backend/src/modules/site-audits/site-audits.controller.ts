import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import {
  createSiteAuditSchema,
  reportQuerySchema,
  type CreateSiteAuditInput,
  type ReportQuery,
} from './site-audits.schemas.js';
import { SiteAuditsService, type SiteAuditReport } from './site-audits.service.js';

/** The free website check (architecture 4.12). */
@ApiTags('site-audits')
@Controller('site-audits')
export class SiteAuditsController {
  constructor(private readonly audits: SiteAuditsService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  create(
    @Body({ schema: createSiteAuditSchema }) body: CreateSiteAuditInput,
  ): Promise<{ id: string }> {
    return this.audits.create(body);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':id')
  report(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query({ schema: reportQuerySchema }) query: ReportQuery,
  ): Promise<SiteAuditReport> {
    return this.audits.report(id, query.locale);
  }
}
