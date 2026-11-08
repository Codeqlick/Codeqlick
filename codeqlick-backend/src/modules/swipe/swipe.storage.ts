import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppConfigService } from '../../config/app-config.service.js';

/** Keys are generated here, so a key from a request can't point anywhere else. */
const KEY_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.webp$/;

export function isStorageKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/**
 * Swipe's photos on disk (`SWIPE_UPLOADS_DIR`), apart from the public media folder: nothing serves
 * this folder by name, every photo goes through the API, which checks who is asking.
 */
@Injectable()
export class SwipeStorage {
  constructor(private readonly config: AppConfigService) {}

  private path(key: string): string {
    if (!isStorageKey(key)) throw new Error(`Not a storage key: ${key}`);
    return join(this.config.swipeUploadsDir, key);
  }

  /** Stores a WebP image under a new key. */
  async write(data: Buffer): Promise<string> {
    const key = `${randomUUID()}.webp`;
    await mkdir(this.config.swipeUploadsDir, { recursive: true, mode: 0o700 });
    await writeFile(this.path(key), data, { flag: 'wx', mode: 0o600 });
    return key;
  }

  /** Size in bytes, or undefined when there is no such file. */
  async size(key: string): Promise<number | undefined> {
    if (!isStorageKey(key)) return undefined;
    try {
      const info = await stat(this.path(key));
      return info.isFile() ? info.size : undefined;
    } catch {
      return undefined;
    }
  }

  read(key: string): ReadStream {
    return createReadStream(this.path(key));
  }

  /** The whole file, or undefined when there is no such file. */
  async readAll(key: string): Promise<Buffer | undefined> {
    try {
      return await readFile(this.path(key));
    } catch {
      return undefined;
    }
  }

  async remove(key: string | null | undefined): Promise<void> {
    if (!key || !isStorageKey(key)) return;
    await rm(this.path(key), { force: true });
  }

  /** Keys of every stored file with its age, for the orphan cleanup. */
  async list(): Promise<{ key: string; modifiedAt: Date }[]> {
    let names: string[];
    try {
      names = await readdir(this.config.swipeUploadsDir);
    } catch {
      return [];
    }
    const files = await Promise.all(
      names.filter(isStorageKey).map(async (key) => {
        try {
          return { key, modifiedAt: (await stat(this.path(key))).mtime };
        } catch {
          return undefined;
        }
      }),
    );
    return files.filter((file) => file !== undefined);
  }
}
