import { Injectable } from '@nestjs/common';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppConfigService } from '../../config/app-config.service.js';

/**
 * Project files on disk, in a `project-files` folder inside UPLOADS_DIR (outside the public media
 * routes, which only serve the top level). Each file is named by its database id.
 */
@Injectable()
export class ProjectFilesStorage {
  constructor(private readonly config: AppConfigService) {}

  private get dir(): string {
    return join(this.config.uploadsDir, 'project-files');
  }

  async write(id: string, data: Buffer): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    // `wx`: never overwrite an existing file.
    await writeFile(join(this.dir, id), data, { flag: 'wx' });
  }

  read(id: string): ReadStream {
    return createReadStream(join(this.dir, id));
  }

  async remove(id: string): Promise<void> {
    await rm(join(this.dir, id), { force: true });
  }
}
