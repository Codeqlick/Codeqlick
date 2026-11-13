import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CloudApi } from '../../common/decorators/cloud-api.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import { Caller, type CloudCtx } from './cloud-caller.js';
import {
  CloudStorageService,
  type BucketKeyView,
  type BucketView,
} from './cloud-storage.service.js';
import {
  bucketKeyParamSchema,
  bucketParamSchema,
  createBucketKeySchema,
  createBucketSchema,
  type BucketKeyParam,
  type BucketParam,
  type CreateBucketInput,
  type CreateBucketKeyInput,
} from './cloud.schemas.js';

/** A project's buckets and their keys (architecture 4.13 "Object storage", decision 48). */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@CloudApi()
@Controller('cloud/projects/:id/buckets')
export class CloudStorageController {
  constructor(private readonly storage: CloudStorageService) {}

  @Get()
  list(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<{
    configured: boolean;
    endpoint: string | null;
    region: string | null;
    items: BucketView[];
  }> {
    return this.storage.list(ctx, params.id);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createBucketSchema }) body: CreateBucketInput,
  ): Promise<BucketView> {
    return this.storage.create(ctx, params.id, body.name);
  }

  @Delete(':bucketId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Caller() ctx: CloudCtx,
    @Param({ schema: bucketParamSchema }) params: BucketParam,
  ): Promise<void> {
    return this.storage.remove(ctx, params.id, params.bucketId);
  }

  @Post(':bucketId/keys')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createKey(
    @Caller() ctx: CloudCtx,
    @Param({ schema: bucketParamSchema }) params: BucketParam,
    @Body({ schema: createBucketKeySchema }) body: CreateBucketKeyInput,
  ): Promise<BucketKeyView & { secretAccessKey: string }> {
    return this.storage.createKey(ctx, params.id, params.bucketId, body);
  }

  @Delete(':bucketId/keys/:keyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeKey(
    @Caller() ctx: CloudCtx,
    @Param({ schema: bucketKeyParamSchema }) params: BucketKeyParam,
  ): Promise<void> {
    return this.storage.removeKey(ctx, params.id, params.bucketId, params.keyId);
  }
}
