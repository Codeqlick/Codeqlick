import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import { detectImageType, IMAGE_TYPES, type ImageExtension } from './image-type.js';
import { MediaStorage } from './media.storage.js';

/** Largest accepted upload, in bytes. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Stored names are generated here, so anything else can't be one of our files. */
const FILENAME_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(png|jpg|webp|gif)$/;

export interface UploadedMedia {
  filename: string;
  contentType: string;
  size: number;
}

export interface MediaFile {
  stream: ReadStream;
  contentType: string;
  size: number;
}

@Injectable()
export class MediaService {
  constructor(private readonly storage: MediaStorage) {}

  async upload(data: Buffer | undefined): Promise<UploadedMedia> {
    if (!data || data.length === 0) {
      throw new BadRequestException('Send the image in a multipart field called "file"');
    }
    const extension = detectImageType(data);
    if (!extension)
      throw new BadRequestException('Only PNG, JPEG, WebP and GIF images are accepted');

    const filename = `${randomUUID()}.${extension}`;
    await this.storage.write(filename, data);
    return { filename, contentType: IMAGE_TYPES[extension], size: data.length };
  }

  async open(filename: string): Promise<MediaFile> {
    const match = FILENAME_PATTERN.exec(filename);
    const size = match ? await this.storage.size(filename) : undefined;
    if (!match || size === undefined) throw new NotFoundException('File not found');

    return {
      stream: this.storage.read(filename),
      contentType: IMAGE_TYPES[match[1] as ImageExtension],
      size,
    };
  }
}
