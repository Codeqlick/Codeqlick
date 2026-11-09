import { Controller, Get, Header, NotFoundException, Param, StreamableFile } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { z } from 'zod';
import { Public } from '../../common/decorators/public.decorator.js';
import { AVATAR_FILE, AvatarStorage } from './avatar.storage.js';

const fileParamSchema = z.object({ file: z.string().regex(AVATAR_FILE) });

/** Profile photos, public: they are shown wherever the account appears outside the 18+ apps. */
@ApiTags('auth')
@Controller('avatars')
export class AvatarsController {
  constructor(private readonly storage: AvatarStorage) {}

  @Public()
  @SkipThrottle()
  @Get(':file')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async file(
    @Param({ schema: fileParamSchema }) params: { file: string },
  ): Promise<StreamableFile> {
    const size = await this.storage.size(params.file);
    if (size === undefined) throw new NotFoundException('Photo not found');
    return new StreamableFile(this.storage.read(params.file), {
      type: 'image/webp',
      length: size,
    });
  }
}
