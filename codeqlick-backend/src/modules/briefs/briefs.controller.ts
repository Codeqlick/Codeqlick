import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { bearerKey } from '../projects/release-key.js';
import { saveBriefSchema, type SaveBriefInput } from './briefs.schemas.js';
import { BriefsService, type BriefView } from './briefs.service.js';

@ApiTags('briefs')
@Controller()
export class BriefsController {
  constructor(private readonly briefs: BriefsService) {}

  @ApiBearerAuth()
  @Roles('CLIENT', 'ADMIN')
  @Get('portal/projects/:id/brief')
  getForClient(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<BriefView> {
    return this.briefs.getForClient(user, params.id);
  }

  @ApiBearerAuth()
  @Roles('CLIENT', 'ADMIN')
  @Put('portal/projects/:id/brief')
  save(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: saveBriefSchema }) body: SaveBriefInput,
  ): Promise<BriefView> {
    return this.briefs.save(user, params.id, body);
  }

  @ApiBearerAuth()
  @Roles('ADMIN')
  @Get('admin/projects/:id/brief')
  getForTeam(@Param({ schema: idParamSchema }) params: IdParam): Promise<BriefView> {
    return this.briefs.getForTeam(params.id);
  }

  /** Asks the client for it (email to every person of the account). */
  @ApiBearerAuth()
  @Roles('ADMIN')
  @Post('admin/projects/:id/brief/request')
  @HttpCode(HttpStatus.OK)
  request(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<BriefView> {
    return this.briefs.request(user, params.id, true);
  }

  /** The brief of the release key's project, for the repository. */
  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiHeader({ name: 'Authorization', description: 'Bearer <release key>' })
  @Get('brief')
  getWithKey(@Headers('authorization') authorization: string | undefined) {
    return this.briefs.getWithKey(bearerKey(authorization));
  }
}
