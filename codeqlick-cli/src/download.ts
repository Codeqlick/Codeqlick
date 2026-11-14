import { createWriteStream } from 'node:fs';
import { rename, rm, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';

/** The name the API gives a deployment's archive: `<slug>-<short id>.tar.gz`. */
export function archiveName(slug: string, shortId: string): string {
  return `${slug}-${shortId}.tar.gz`;
}

/** Where to save it: `--out`, or its own name in the current folder. */
export function archivePath(out: string | undefined, slug: string, shortId: string): string {
  return resolve(out || archiveName(slug, shortId));
}

/** True when something already exists at `path` (a file, a folder or a link). */
export async function exists(path: string): Promise<boolean> {
  return (await stat(path).catch(() => null)) !== null;
}

/**
 * Writes a downloaded body to `<file>.part` and renames it to `file` once complete, so a cut
 * download leaves nothing behind. Returns the bytes written.
 */
export async function saveArchive(
  body: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
  file: string,
): Promise<number> {
  const part = `${file}.part`;
  const source =
    body instanceof ReadableStream
      ? Readable.fromWeb(body as WebReadableStream<Uint8Array>)
      : Readable.from(body);
  const sink = createWriteStream(part, { mode: 0o644 });
  try {
    await pipeline(source, sink);
    await rename(part, file);
  } catch (error) {
    await rm(part, { force: true }).catch(() => undefined);
    throw error;
  }
  return sink.bytesWritten;
}

/**
 * What to tell the person when saving failed: the file system's own error (no permission, a
 * folder in the way…) as it is, anything else as a cut download. Nothing is left behind either way.
 */
export function downloadFailure(error: unknown, file: string): Error {
  const failure = error as NodeJS.ErrnoException;
  const fileSystem = [
    'EACCES',
    'EPERM',
    'EISDIR',
    'ENOTDIR',
    'ENOENT',
    'ENOSPC',
    'EROFS',
    'EEXIST',
  ];
  if (failure?.code && fileSystem.includes(failure.code)) {
    return new Error(`Can't save ${file}: ${failure.message}`);
  }
  const detail = (failure?.cause as Error | undefined)?.message ?? failure?.message ?? 'unknown';
  return new Error(`The download was cut (${detail}); nothing was saved.`);
}
