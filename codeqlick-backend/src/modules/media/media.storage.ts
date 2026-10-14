import { Injectable } from '@nestjs/common';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppConfigService } from '../../config/app-config.service.js';

/** Uploaded files on disk (the `UPLOADS_DIR` folder). The only place that touches the file system. */
@Injectable()
export class MediaStorage {
  constructor(private readonly config: AppConfigService) {}

  private path(filename: string): string {
    return join(this.config.uploadsDir, filename);
  }

  async write(filename: string, data: Buffer): Promise<void> {
    await mkdir(this.config.uploadsDir, { recursive: true });
    // `wx`: never overwrite an existing file.
    await writeFile(this.path(filename), data, { flag: 'wx' });
  }

  /** Size in bytes, or undefined when the file does not exist. */
  async size(filename: string): Promise<number | undefined> {
    try {
      const info = await stat(this.path(filename));
      return info.isFile() ? info.size : undefined;
    } catch {
      return undefined;
    }
  }

  read(filename: string): ReadStream {
    return createReadStream(this.path(filename));
  }
}
