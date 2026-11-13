import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CloudApi } from '../../common/decorators/cloud-api.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import { Caller, type CloudCtx } from './cloud-caller.js';
import { CloudDatabasesService, type DatabaseView } from './cloud-databases.service.js';
import {
  createDatabaseSchema,
  databaseParamSchema,
  type CreateDatabaseInput,
  type DatabaseParam,
} from './cloud.schemas.js';

/** A project's managed databases (architecture 4.13 "Databases", decision 47). */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@CloudApi()
@Controller('cloud/projects/:id/databases')
export class CloudDatabasesController {
  constructor(private readonly databases: CloudDatabasesService) {}

  @Get()
  list(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<{ configured: boolean; items: DatabaseView[] }> {
    return this.databases.list(ctx, params.id);
  }

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createDatabaseSchema }) body: CreateDatabaseInput,
  ): Promise<DatabaseView & { password: string }> {
    return this.databases.create(ctx, params.id, body.name);
  }

  @Post(':databaseId/password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  resetPassword(
    @Caller() ctx: CloudCtx,
    @Param({ schema: databaseParamSchema }) params: DatabaseParam,
  ): Promise<DatabaseView & { password: string }> {
    return this.databases.resetPassword(ctx, params.id, params.databaseId);
  }

  @Delete(':databaseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Caller() ctx: CloudCtx,
    @Param({ schema: databaseParamSchema }) params: DatabaseParam,
  ): Promise<void> {
    return this.databases.remove(ctx, params.id, params.databaseId);
  }
}
