import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { TimeService, type ProjectTime } from './time.service.js';

@ApiTags('portal')
@ApiBearerAuth()
@Roles('CLIENT', 'ADMIN')
@Controller('portal/projects')
export class PortalTimeController {
  constructor(private readonly time: TimeService) {}

  /** 404 unless the project is the caller's and its hours are shown to the client. */
  @Get(':id/time')
  forProject(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<ProjectTime> {
    return this.time.forClient(user, params.id);
  }
}
