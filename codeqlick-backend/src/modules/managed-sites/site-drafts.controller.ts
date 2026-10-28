import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator.js';
import { SiteEditorService } from './site-editor.service.js';

/**
 * The files of a draft's preview (architecture 8.2), by its key: public, as the key is the secret.
 * The website serves them at `/site-draft/<key>/`, sandboxed.
 */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('site-drafts')
export class SiteDraftsController {
  constructor(private readonly editor: SiteEditorService) {}

  @Get(':key{/*path}')
  async file(
    @Param('key') key: string,
    @Param('path') path: string | string[] | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.editor.previewFile(
      key,
      Array.isArray(path) ? path.join('/') : (path ?? ''),
    );
    if (!file?.body) throw new NotFoundException('Not found');
    res.status(200);
    res.setHeader('Content-Type', file.headers.get('content-type') ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Security-Policy', 'sandbox allow-scripts');
    res.setHeader('X-Robots-Tag', 'noindex');
    Readable.fromWeb(file.body as WebReadableStream).pipe(res);
  }
}
