import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import {
  errorsQuerySchema,
  reportErrorSchema,
  type ErrorsQuery,
  type ReportErrorInput,
} from './errors.schemas.js';
import { ErrorsService, type ErrorView } from './errors.service.js';

@ApiTags('errors')
@Controller()
export class ErrorsController {
  constructor(private readonly errors: ErrorsService) {}

  /** The website reports its errors here (its server, through the BFF, for both kinds). */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('errors')
  @HttpCode(HttpStatus.NO_CONTENT)
  async report(@Body({ schema: reportErrorSchema }) body: ReportErrorInput): Promise<void> {
    await this.errors.report(body);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('admin/errors')
  list(@Query({ schema: errorsQuerySchema }) query: ErrorsQuery): Promise<ErrorView[]> {
    return this.errors.list(query.status);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('admin/errors/resolve-all')
  @HttpCode(HttpStatus.OK)
  resolveAll(): Promise<{ resolved: number }> {
    return this.errors.resolveAll();
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('admin/errors/:id')
  get(@Param({ schema: idParamSchema }) params: IdParam): Promise<ErrorView> {
    return this.errors.get(params.id);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('admin/errors/:id/resolve')
  @HttpCode(HttpStatus.OK)
  resolve(@Param({ schema: idParamSchema }) params: IdParam): Promise<ErrorView> {
    return this.errors.setResolved(params.id, true);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('admin/errors/:id/reopen')
  @HttpCode(HttpStatus.OK)
  reopen(@Param({ schema: idParamSchema }) params: IdParam): Promise<ErrorView> {
    return this.errors.setResolved(params.id, false);
  }
}
