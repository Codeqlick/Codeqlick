import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import {
  createTagSchema,
  updateTagSchema,
  type CreateTagInput,
  type UpdateTagInput,
} from './tags.schemas.js';
import { TagsService, type AdminTag } from './tags.service.js';

@ApiTags('admin/tags')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/tags')
export class AdminTagsController {
  constructor(private readonly tags: TagsService) {}

  @Get()
  list(): Promise<AdminTag[]> {
    return this.tags.listAll();
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createTagSchema }) body: CreateTagInput,
  ): Promise<AdminTag> {
    return this.tags.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updateTagSchema }) body: UpdateTagInput,
  ): Promise<AdminTag> {
    return this.tags.update(user, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthUser,
    @Param({ schema: idParamSchema }) params: IdParam,
  ): Promise<void> {
    await this.tags.delete(user, params.id);
  }
}
