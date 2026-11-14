import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CloudApi } from '../../common/decorators/cloud-api.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import { Caller, type CloudCtx } from './cloud-caller.js';
import {
  CloudDeployHooksService,
  type HookCalled,
  type HookView,
} from './cloud-deploy-hooks.service.js';
import {
  createHookSchema,
  hookParamSchema,
  type CreateHookInput,
  type HookParam,
} from './cloud.schemas.js';

/** What a CMS calls to rebuild a site (architecture 4.13 "Deploy hooks"): the token is the credential. */
@ApiTags('cloud')
@Public()
@Controller('cloud/hooks')
export class CloudDeployHooksPublicController {
  constructor(private readonly hooks: CloudDeployHooksService) {}

  /** No body is read: any payload is ignored. The service counts the calls (per hook and per IP). */
  @Post(':token')
  @SkipThrottle()
  @HttpCode(HttpStatus.ACCEPTED)
  call(@Param('token') token: string, @Req() request: Request): Promise<HookCalled> {
    return this.hooks.call(token, request.ip?.slice(0, 45) ?? null);
  }
}

/** A project's deploy hooks, for its team (session or API token). */
@ApiTags('cloud')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@CloudApi()
@Controller('cloud/projects/:id/hooks')
export class CloudDeployHooksController {
  constructor(private readonly hooks: CloudDeployHooksService) {}

  @Get()
  list(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<{ items: HookView[] }> {
    return this.hooks.list(ctx, params.id);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(
    @Caller() ctx: CloudCtx,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: createHookSchema }) body: CreateHookInput,
  ): Promise<HookView> {
    return this.hooks.create(ctx, params.id, body);
  }

  @Delete(':hookId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Caller() ctx: CloudCtx,
    @Param({ schema: hookParamSchema }) params: HookParam,
  ): Promise<void> {
    return this.hooks.remove(ctx, params.id, params.hookId);
  }
}
