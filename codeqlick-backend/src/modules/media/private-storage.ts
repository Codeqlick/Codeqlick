import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** File kinds a private store keeps: images (WebP) and, for Cruising, videos (MP4). */
export type PrivateFileExtension = 'webp' | 'mp4';

/** Keys are generated here, so a key from a request can't point anywhere else. */
const KEY_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(webp|mp4)$/;

/** A key this store made, of one of `extensions`. */
export function isPrivateKey(
  key: string,
  extensions: readonly PrivateFileExtension[] = ['webp'],
): boolean {
  const match = KEY_PATTERN.exec(key);
  return !!match && extensions.includes(match[1] as PrivateFileExtension);
}

/**
 * Files on disk that nothing serves by name (Swipe's photos, Cruising's media): every file goes
 * through the API, which checks who is asking. Files are written with mode 0600 in a 0700 folder.
 * Subclasses say which folder and which kinds of file they keep.
 */
export abstract class PrivateFileStorage {
  /** The folder of this store's files. */
  protected abstract dir(): string;

  /** The kinds of file this store keeps; the orphan listing only sees these. */
  protected extensions(): readonly PrivateFileExtension[] {
    return ['webp'];
  }

  isKey(key: string): boolean {
    return isPrivateKey(key, this.extensions());
  }

  /** The file's path on disk (for tools such as ffmpeg). Throws for anything but a key. */
  path(key: string): string {
    if (!this.isKey(key)) throw new Error(`Not a storage key: ${key}`);
    return join(this.dir(), key);
  }

  private newKey(extension: PrivateFileExtension): string {
    return `${randomUUID()}.${extension}`;
  }

  /** Stores data under a new key. */
  async write(data: Buffer, extension: PrivateFileExtension = 'webp'): Promise<string> {
    const key = this.newKey(extension);
    await mkdir(this.dir(), { recursive: true, mode: 0o700 });
    await writeFile(this.path(key), data, { flag: 'wx', mode: 0o600 });
    return key;
  }

  /** Moves a finished file (written by a tool in a work folder of the same disk) in, under a new key. */
  async adopt(source: string, extension: PrivateFileExtension): Promise<string> {
    const key = this.newKey(extension);
    await mkdir(this.dir(), { recursive: true, mode: 0o700 });
    await rename(source, this.path(key));
    return key;
  }

  /** Size in bytes, or undefined when there is no such file. */
  async size(key: string): Promise<number | undefined> {
    if (!this.isKey(key)) return undefined;
    try {
      const info = await stat(this.path(key));
      return info.isFile() ? info.size : undefined;
    } catch {
      return undefined;
    }
  }

  /** The file, or the bytes `start` to `end` (inclusive) of it. */
  read(key: string, range?: { start: number; end: number }): ReadStream {
    return createReadStream(this.path(key), range);
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
    if (!key || !this.isKey(key)) return;
    await rm(this.path(key), { force: true });
  }

  /** Keys of every stored file with its age, for the orphan cleanup. */
  async list(): Promise<{ key: string; modifiedAt: Date }[]> {
    let names: string[];
    try {
      names = await readdir(this.dir());
    } catch {
      return [];
    }
    const files = await Promise.all(
      names
        .filter((name) => this.isKey(name))
        .map(async (key) => {
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
