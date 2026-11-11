import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import {
  idParamSchema,
  paginationSchema,
  type IdParam,
  type PaginationQuery,
} from '../../common/schemas/common.schemas.js';
import type { Paginated } from '../../common/types/paginated.js';
import type { KeptMessage } from '../site-forms/site-forms.service.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { SiteVisitsService, type ProjectVisits } from './site-visits.service.js';

const messageParamSchema = z.object({ id: z.uuid(), messageId: z.uuid() });

const daysQuerySchema = z.object({
  days: z.enum(['7', '30', '90']).default('30').transform(Number),
});

@ApiTags('portal/site')
@ApiBearerAuth()
@Controller()
export class SiteVisitsController {
  constructor(private readonly visits: SiteVisitsService) {}

  @Roles('CLIENT', 'ADMIN')
  @Get('portal/projects/:id/visits')
  forClient(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: daysQuerySchema }) query: { days: number },
  ): Promise<ProjectVisits> {
    return this.visits.get(user, params.id, query.days);
  }

  @Roles('ADMIN')
  @Get('admin/projects/:id/visits')
  forTeam(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: daysQuerySchema }) query: { days: number },
  ): Promise<ProjectVisits> {
    return this.visits.get(user, params.id, query.days);
  }

  /** The messages the site's form kept (decision 31). */
  @Roles('CLIENT', 'ADMIN')
  @Get('portal/projects/:id/site/messages')
  messages(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Query({ schema: paginationSchema }) query: PaginationQuery,
  ): Promise<Paginated<KeptMessage>> {
    return this.visits.messages(user, params.id, query.page, query.pageSize);
  }

  @Roles('CLIENT', 'ADMIN')
  @Delete('portal/projects/:id/site/messages/:messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteMessage(
    @CurrentUser() user: AuthUser,
    @Param({ schema: messageParamSchema }) params: { id: string; messageId: string },
  ): Promise<void> {
    return this.visits.deleteMessage(user, params.id, params.messageId);
  }
}
