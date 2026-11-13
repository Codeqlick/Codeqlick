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
  Query,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CloudApi } from '../../common/decorators/cloud-api.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { Caller, type CloudCtx } from './cloud-caller.js';
import { CloudKvService, type KvEntryView, type KvListView } from './cloud-kv.service.js';
import {
  kvIncrSchema,
  kvListQuerySchema,
  kvParamSchema,
  kvPublicParamSchema,
  kvPutSchema,
  type KvIncrInput,
  type KvListQuery,
  type KvParam,
  type KvPublicParam,
  type KvPutInput,
} from './cloud.schemas.js';

const KV_RATE = { default: { limit: 600, ttl: 60_000 } };

/** `public:` keys, readable by anyone (architecture 4.13 "Key-value store"). */
@ApiTags('cloud')
@Public()
@Controller('cloud/kv')
export class CloudKvPublicController {
  constructor(private readonly kv: CloudKvService) {}

  @Get(':slug/:key')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async read(
    @Param({ schema: kvPublicParamSchema }) params: KvPublicParam,
    @Res() res: Response,
  ): Promise<void> {
    const value = await this.kv.publicValue(params.slug, params.key);
    res.setHeader('Cache-Control', 'public, max-age=10');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.json(value);
  }
}

/** A project's key-value store, for its team (session or API token). */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@CloudApi()
@Throttle(KV_RATE)
@Controller('cloud/projects/:id/kv')
export class CloudKvController {
  constructor(private readonly kv: CloudKvService) {}

  @Get()
  list(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: kvListQuerySchema }) query: KvListQuery,
  ): Promise<KvListView> {
    return this.kv.list(ctx, params.id, query);
  }

  @Get(':key')
  get(
    @Caller() ctx: CloudCtx,
    @Param({ schema: kvParamSchema }) params: KvParam,
  ): Promise<KvEntryView> {
    return this.kv.get(ctx, params.id, params.key);
  }

  @Put(':key')
  put(
    @Caller() ctx: CloudCtx,
    @Param({ schema: kvParamSchema }) params: KvParam,
    @Body({ schema: kvPutSchema }) body: KvPutInput,
  ): Promise<KvEntryView> {
    return this.kv.put(ctx, params.id, params.key, body);
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Caller() ctx: CloudCtx,
    @Param({ schema: kvParamSchema }) params: KvParam,
  ): Promise<void> {
    return this.kv.remove(ctx, params.id, params.key);
  }

  @Post(':key/incr')
  @HttpCode(HttpStatus.OK)
  incr(
    @Caller() ctx: CloudCtx,
    @Param({ schema: kvParamSchema }) params: KvParam,
    @Body({ schema: kvIncrSchema }) body: KvIncrInput,
  ): Promise<{ key: string; value: Prisma.JsonValue }> {
    return this.kv.incr(ctx, params.id, params.key, body);
  }
}
