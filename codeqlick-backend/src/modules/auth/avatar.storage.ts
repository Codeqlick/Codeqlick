import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { AppConfigService } from '../../config/app-config.service.js';
import { detectImageType } from '../media/image-type.js';

/** File names of stored profile photos. */
export const AVATAR_FILE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.webp$/;
/** Side of the stored square, in pixels. */
export const AVATAR_SIDE = 256;
/** Images larger than this many pixels are refused before decoding (decompression bombs). */
const MAX_INPUT_PIXELS = 50_000_000;

/**
 * A profile photo as stored: rotated as taken, cropped to a centred 256×256 square and saved as
 * WebP, which drops every metadata field. Undefined for anything that isn't a PNG, JPEG or WebP.
 */
export async function processAvatar(input: Buffer): Promise<Buffer | undefined> {
  const type = detectImageType(input);
  if (type !== 'png' && type !== 'jpg' && type !== 'webp') return undefined;
  try {
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize(AVATAR_SIDE, AVATAR_SIDE, { fit: 'cover', position: 'attention' })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return undefined;
  }
}

/** Profile photos on disk, in `UPLOADS_DIR/avatars` (apart from the media library's files). */
@Injectable()
export class AvatarStorage {
  constructor(private readonly config: AppConfigService) {}

  private get dir(): string {
    return join(this.config.uploadsDir, 'avatars');
  }

  /** Stores a processed photo under a new random name and returns the name. */
  async write(data: Buffer): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    const name = `${randomUUID()}.webp`;
    await writeFile(join(this.dir, name), data, { flag: 'wx' });
    return name;
  }

  async size(name: string): Promise<number | undefined> {
    if (!AVATAR_FILE.test(name)) return undefined;
    try {
      const info = await stat(join(this.dir, name));
      return info.isFile() ? info.size : undefined;
    } catch {
      return undefined;
    }
  }

  read(name: string): ReadStream {
    return createReadStream(join(this.dir, name));
  }

  async remove(name: string | null | undefined): Promise<void> {
    if (name && AVATAR_FILE.test(name)) await rm(join(this.dir, name), { force: true });
  }

  /** Stored photos with their age, for the sweep. */
  async list(): Promise<{ name: string; modifiedAt: Date }[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return [];
    }
    const files = await Promise.all(
      names
        .filter((name) => AVATAR_FILE.test(name))
        .map(async (name) => {
          try {
            return { name, modifiedAt: (await stat(join(this.dir, name))).mtime };
          } catch {
            return undefined;
          }
        }),
    );
    return files.filter((file) => file !== undefined);
  }
}
