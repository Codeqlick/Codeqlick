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
import { Roles } from '../../common/decorators/roles.decorator.js';
import { idParamSchema, type IdParam } from '../../common/schemas/common.schemas.js';
import {
  createSavedReplySchema,
  updateSavedReplySchema,
  type CreateSavedReplyInput,
  type UpdateSavedReplyInput,
} from './saved-replies.schemas.js';
import { SavedRepliesService, type SavedReplyView } from './saved-replies.service.js';

@ApiTags('admin/saved-replies')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/saved-replies')
export class AdminSavedRepliesController {
  constructor(private readonly replies: SavedRepliesService) {}

  @Get()
  list(): Promise<SavedReplyView[]> {
    return this.replies.list();
  }

  @Post()
  create(
    @Body({ schema: createSavedReplySchema }) body: CreateSavedReplyInput,
  ): Promise<SavedReplyView> {
    return this.replies.create(body);
  }

  @Patch(':id')
  update(
    @Param({ schema: idParamSchema }) params: IdParam,
    @Body({ schema: updateSavedReplySchema }) body: UpdateSavedReplyInput,
  ): Promise<SavedReplyView> {
    return this.replies.update(params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param({ schema: idParamSchema }) params: IdParam): Promise<void> {
    await this.replies.delete(params.id);
  }
}
