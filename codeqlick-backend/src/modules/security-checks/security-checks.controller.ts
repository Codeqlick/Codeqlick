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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import type { Paginated } from '../../common/types/paginated.js';
import {
  createSecurityCheckSchema,
  listSecurityChecksQuerySchema,
  reportQuerySchema,
  type CreateSecurityCheckInput,
  type ListSecurityChecksQuery,
  type ReportQuery,
} from './security-checks.schemas.js';
import {
  SecurityChecksService,
  type AdminSecurityCheck,
  type SecurityCheckReport,
} from './security-checks.service.js';

/** The free Security check (architecture 4.19). */
@ApiTags('security-checks')
@Controller('security-checks')
export class SecurityChecksController {
  constructor(private readonly checks: SecurityChecksService) {}

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  create(
    @Body({ schema: createSecurityCheckSchema }) body: CreateSecurityCheckInput,
  ): Promise<{ id: string }> {
    return this.checks.create(body);
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get(':id')
  report(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query({ schema: reportQuerySchema }) query: ReportQuery,
  ): Promise<SecurityCheckReport> {
    return this.checks.report(id, query.locale);
  }
}

/** The team's view of the checks. */
@ApiTags('admin/security-checks')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/security-checks')
export class AdminSecurityChecksController {
  constructor(private readonly checks: SecurityChecksService) {}

  @Get()
  list(
    @Query({ schema: listSecurityChecksQuerySchema }) query: ListSecurityChecksQuery,
  ): Promise<Paginated<AdminSecurityCheck>> {
    return this.checks.adminList(query);
  }
}
