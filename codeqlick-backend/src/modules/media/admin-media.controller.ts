import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { paginationSchema, type PaginationQuery } from '../../common/schemas/common.schemas.js';
import type { Paginated } from '../../common/types/paginated.js';
import {
  MAX_IMAGE_BYTES,
  MediaService,
  type MediaItem,
  type UploadedMedia,
} from './media.service.js';

@ApiTags('admin/media')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin/media')
export class AdminMediaController {
  constructor(private readonly media: MediaService) {}

  @Get()
  list(@Query({ schema: paginationSchema }) query: PaginationQuery): Promise<Paginated<MediaItem>> {
    return this.media.list(query.page, query.pageSize);
  }

  @Delete(':filename')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('filename') filename: string): Promise<void> {
    await this.media.remove(filename);
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  // No storage option: the file stays in memory until its content has been checked.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } }))
  upload(@UploadedFile() file: { buffer: Buffer } | undefined): Promise<UploadedMedia> {
    return this.media.upload(file?.buffer);
  }
}
