import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createWriteStream, mkdirSync, rmSync } from 'node:fs';
import { readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AppConfigService } from '../../config/app-config.service.js';
import { readDiskSpace } from '../../common/disk-space.js';
import { PrivateFileStorage, type PrivateFileExtension } from '../media/private-storage.js';

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
/** A file in the work folder: an upload being received or waiting, or a transcode's output. */
const WORK_FILE = /^([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})\.(upload|mp4)$/;

/** A file as multer hands it to a storage engine, and what the engine adds to it. */
interface IncomingUpload {
  stream: Readable;
  path?: string;
}
type EngineDone = (error: Error | null, info?: { path: string; size: number }) => void;

/**
 * A multer storage engine (multer's own interface: `_handleFile` / `_removeFile`) that writes each
 * upload into the work folder as it arrives (mode 0600), so a 100 MB video is never held in memory.
 */
export interface UploadEngine {
  _handleFile(req: unknown, file: IncomingUpload, done: EngineDone): void;
  _removeFile(req: unknown, file: IncomingUpload, done: (error: Error | null) => void): void;
}

/**
 * Cruising's photos and videos on disk (`CRUISING_UPLOADS_DIR`, architecture 4.15, phase 4):
 * `<uuid>.webp` (photos, posters, verification photos) and `<uuid>.mp4`, never served by name. The
 * `incoming` folder beside them holds uploads while they arrive and videos waiting to be transcoded.
 */
@Injectable()
export class CruisingMediaStorage extends PrivateFileStorage {
  constructor(private readonly config: AppConfigService) {
    super();
  }

  protected dir(): string {
    return this.config.cruisingUploadsDir;
  }

  protected override extensions(): readonly PrivateFileExtension[] {
    return ['webp', 'mp4'];
  }

  /** The work folder (created when missing, for multer, which writes uploads there). */
  incomingDir(): string {
    const dir = join(this.dir(), 'incoming');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return dir;
  }

  /** The engine the module's multer writes uploads with. */
  uploadEngine(): UploadEngine {
    return {
      _handleFile: (_req, file, done) => {
        const path = join(this.incomingDir(), `tmp-${randomUUID()}`);
        let size = 0;
        file.stream.on('data', (chunk: Buffer) => {
          size += chunk.length;
        });
        pipeline(file.stream, createWriteStream(path, { flags: 'wx', mode: 0o600 })).then(
          () => done(null, { path, size }),
          (error: Error) => {
            rmSync(path, { force: true });
            done(error);
          },
        );
      },
      _removeFile: (_req, file, done) => {
        if (file.path) rmSync(file.path, { force: true });
        done(null);
      },
    };
  }

  /** Where a video waits for the transcoder, named after its media item. */
  incomingPath(mediaId: string): string {
    if (!UUID.test(mediaId)) throw new Error(`Not a media id: ${mediaId}`);
    return join(this.incomingDir(), `${mediaId}.upload`);
  }

  /** Where a transcode writes its output before it is moved in. */
  outputPath(mediaId: string): string {
    if (!UUID.test(mediaId)) throw new Error(`Not a media id: ${mediaId}`);
    return join(this.incomingDir(), `${mediaId}.mp4`);
  }

  /** Moves an upload multer received into the queue's place for its media item. */
  async queueUpload(uploadPath: string, mediaId: string): Promise<void> {
    await rename(uploadPath, this.incomingPath(mediaId));
  }

  async exists(path: string): Promise<boolean> {
    try {
      return (await stat(path)).isFile();
    } catch {
      return false;
    }
  }

  /** Deletes a file by path (multer's uploads and work files); nothing there is fine. */
  async removePath(path: string | undefined): Promise<void> {
    if (path) await rm(path, { force: true });
  }

  /** Every file of the work folder with its age and, for queue files, the media id. */
  async listIncoming(): Promise<{ path: string; mediaId: string | null; modifiedAt: Date }[]> {
    const dir = this.incomingDir();
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return [];
    }
    const files = await Promise.all(
      names.map(async (name) => {
        const path = join(dir, name);
        try {
          const info = await stat(path);
          if (!info.isFile()) return undefined;
          return { path, mediaId: WORK_FILE.exec(name)?.[1] ?? null, modifiedAt: info.mtime };
        } catch {
          return undefined;
        }
      }),
    );
    return files.filter((file) => file !== undefined);
  }

  /**
   * Whether the server's disk is under the disk guard's low mark (decision 49, the same floors as
   * Cloud's guard), read on the disk holding CRUISING_UPLOADS_DIR. Unknown counts as not low.
   */
  async diskLow(): Promise<boolean> {
    try {
      const reading = await readDiskSpace(this.incomingDir(), this.config.cloudDisk);
      return reading.state !== 'ok';
    } catch {
      return false;
    }
  }
}
