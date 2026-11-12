import { createWriteStream } from 'node:fs';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';

/** A file of the folder being deployed: its path inside the bundle and on disk. */
export interface BundleFile {
  path: string;
  absolute: string;
  size: number;
}

/**
 * `.codeqlickignore` patterns: one per line, `#` comments, `*` matches anything but `/`, `**`
 * anything, a trailing `/` a folder. A pattern without `/` matches a name at any depth.
 */
export function ignoreMatcher(text: string): (path: string, folder: boolean) => boolean {
  const rules = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const folderOnly = line.endsWith('/');
      const pattern = line.replace(/\/+$/, '').replace(/^\/+/, '');
      const anchored = line.replace(/\/+$/, '').includes('/');
      const source = pattern
        .split('**')
        .map((part) =>
          part
            .split('*')
            .map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
            .join('[^/]*'),
        )
        .join('.*');
      const regex = new RegExp(anchored ? `^${source}$` : `(^|/)${source}$`);
      return { regex, folderOnly };
    });
  return (path, folder) =>
    rules.some((rule) => (!rule.folderOnly || folder) && rule.regex.test(path));
}

/** Whether a dotfile or dot-folder is left out (all but `.well-known`). */
const hidden = (name: string) => name.startsWith('.') && name !== '.well-known';

/** The files to deploy from `root`, sorted, without dotfiles, links or ignored paths. */
export async function collect(root: string): Promise<BundleFile[]> {
  let ignore: (path: string, folder: boolean) => boolean = () => false;
  try {
    ignore = ignoreMatcher(await readFile(join(root, '.codeqlickignore'), 'utf8'));
  } catch {
    // No ignore file.
  }
  const files: BundleFile[] = [];
  const walk = async (folder: string): Promise<void> => {
    const entries = await readdir(folder, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (hidden(entry.name)) continue;
      const absolute = join(folder, entry.name);
      const path = relative(root, absolute).split(sep).join('/');
      if (entry.isDirectory()) {
        if (!ignore(path, true)) await walk(absolute);
      } else if (entry.isFile()) {
        if (!ignore(path, false))
          files.push({ path, absolute, size: (await lstat(absolute)).size });
      }
      // Links and anything else are left out: the server refuses them.
    }
  };
  await walk(root);
  return files;
}

const BLOCK = 512;

function octal(value: number, length: number): string {
  return value.toString(8).padStart(length - 1, '0') + '\0';
}

function write(buffer: Buffer, offset: number, text: string, length: number): void {
  buffer.write(text, offset, Math.min(length, Buffer.byteLength(text)), 'utf8');
}

/** A 512-byte ustar header (type `0` file or `x` PAX extended header). */
function header(name: string, size: number, type: '0' | 'x', mtime: number): Buffer {
  const block = Buffer.alloc(BLOCK);
  write(block, 0, name, 100);
  write(block, 100, octal(0o644, 8), 8);
  write(block, 108, octal(0, 8), 8);
  write(block, 116, octal(0, 8), 8);
  write(block, 124, octal(size, 12), 12);
  write(block, 136, octal(mtime, 12), 12);
  block.fill(' ', 148, 156);
  write(block, 156, type, 1);
  write(block, 257, 'ustar\0', 6);
  write(block, 263, '00', 2);
  let sum = 0;
  for (const byte of block) sum += byte;
  write(block, 148, `${sum.toString(8).padStart(6, '0')}\0 `, 8);
  return block;
}

/** A PAX record: `<length> path=<value>\n`, the length counting itself. */
function paxRecord(key: string, value: string): string {
  const body = ` ${key}=${value}\n`;
  let length = Buffer.byteLength(body) + 1;
  while (String(length).length + Buffer.byteLength(body) !== length) {
    length = String(length).length + Buffer.byteLength(body);
  }
  return `${length}${body}`;
}

const padding = (size: number) => Buffer.alloc((BLOCK - (size % BLOCK)) % BLOCK);

/** The tar stream of the files: a PAX header before any path that doesn't fit ustar's 100 bytes. */
async function* tarStream(files: BundleFile[]): AsyncGenerator<Buffer> {
  const mtime = Math.floor(Date.now() / 1000);
  for (const file of files) {
    const fits = Buffer.byteLength(file.path) <= 100 && /^[\x20-\x7e]+$/.test(file.path);
    if (!fits) {
      const record = Buffer.from(paxRecord('path', file.path));
      yield header('PaxHeader', record.length, 'x', mtime);
      yield record;
      yield padding(record.length);
    }
    const data = await readFile(file.absolute);
    yield header(
      fits ? file.path : file.path.slice(0, 99).replace(/[^\x20-\x7e]/g, '_'),
      data.length,
      '0',
      mtime,
    );
    yield data;
    yield padding(data.length);
  }
  yield Buffer.alloc(BLOCK * 2);
}

/** Writes the files as a gzipped tar to `target`; returns its size in bytes. */
export async function pack(files: BundleFile[], target: string): Promise<number> {
  await pipeline(
    Readable.from(tarStream(files)),
    createGzip({ level: 9 }),
    createWriteStream(target),
  );
  return (await lstat(target)).size;
}
