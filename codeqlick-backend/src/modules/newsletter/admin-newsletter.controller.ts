import { Controller, Delete, Get, HttpCode, HttpStatus, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { listSubscribersQuerySchema, type ListSubscribersQuery } from './newsletter.schemas.js';
import { NewsletterService, type SubscriberList } from './newsletter.service.js';

@ApiTags('admin/newsletter')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/newsletter')
export class AdminNewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}

  @Get()
  list(
    @Query({ schema: listSubscribersQuerySchema }) query: ListSubscribersQuery,
  ): Promise<SubscriberList> {
    return this.newsletter.list(query);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    return this.newsletter.delete(user, params.id);
  }
}
