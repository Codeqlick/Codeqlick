import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { MediaService } from './media.service.js';

@ApiTags('media')
@Public()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** File names are random and never reused, so a file can be cached forever. */
  @Get(':filename')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async get(@Param('filename') filename: string): Promise<StreamableFile> {
    const file = await this.media.open(filename);
    return new StreamableFile(file.stream, { type: file.contentType, length: file.size });
  }
}
