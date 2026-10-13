import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Paginated } from '../../common/types/paginated.js';
import {
  createUserSchema,
  listUsersQuerySchema,
  updateUserSchema,
  type CreateUserInput,
  type ListUsersQuery,
  type UpdateUserInput,
} from './users.schemas.js';
import { UsersService, type AdminUser } from './users.service.js';

@ApiTags('admin/users')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(
    @Query({ schema: listUsersQuerySchema }) query: ListUsersQuery,
  ): Promise<Paginated<AdminUser>> {
    return this.users.list(query);
  }

  @Post()
  create(@Body({ schema: createUserSchema }) body: CreateUserInput): Promise<AdminUser> {
    return this.users.create(body);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updateUserSchema }) body: UpdateUserInput,
  ): Promise<AdminUser> {
    return this.users.update(actor, params.id, body);
  }
}
