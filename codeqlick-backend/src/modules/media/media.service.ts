import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ReadStream } from 'node:fs';
import { detectImageType, IMAGE_TYPES, type ImageExtension } from './image-type.js';
import { paginate, type Paginated } from '../../common/types/paginated.js';
import { MediaRepository, type MediaUsage } from './media.repository.js';
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

/** One row of the media library. */
export interface MediaItem extends UploadedMedia {
  createdAt: string;
  /** Posts and case studies that use the image as a cover or in their content. */
  usedBy: MediaUsage[];
}

export interface MediaFile {
  stream: ReadStream;
  contentType: string;
  size: number;
}

@Injectable()
export class MediaService {
  constructor(
    private readonly storage: MediaStorage,
    private readonly repository: MediaRepository,
  ) {}

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

  /** Uploaded images, newest first, each with the content that uses it. */
  async list(page: number, pageSize: number): Promise<Paginated<MediaItem>> {
    const files = (await this.storage.list())
      .filter((file) => FILENAME_PATTERN.test(file.filename))
      .toSorted((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
    const pageFiles = files.slice((page - 1) * pageSize, page * pageSize);
    const usage = await this.repository.findUsage(pageFiles.map((file) => file.filename));

    const items = pageFiles.map((file): MediaItem => {
      const extension = FILENAME_PATTERN.exec(file.filename)?.[1] as ImageExtension;
      return {
        filename: file.filename,
        contentType: IMAGE_TYPES[extension],
        size: file.size,
        createdAt: file.modifiedAt.toISOString(),
        usedBy: usage.get(file.filename) ?? [],
      };
    });
    return paginate(items, files.length, page, pageSize);
  }

  /** Deletes an image nothing uses. One that is still referenced would leave a broken page. */
  async remove(filename: string): Promise<void> {
    const exists =
      FILENAME_PATTERN.test(filename) && (await this.storage.size(filename)) !== undefined;
    if (!exists) throw new NotFoundException('File not found');

    const usedBy = (await this.repository.findUsage([filename])).get(filename) ?? [];
    if (usedBy.length > 0) {
      const where = usedBy.map((item) => `${item.type} "${item.slug}"`).join(', ');
      throw new ConflictException(`This image is still used by ${where}`);
    }
    await this.storage.remove(filename);
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
