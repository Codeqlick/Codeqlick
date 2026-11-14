import { randomBytes } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readdir,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough, type Readable } from 'node:stream';
import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { create, list, x } from 'tar';
import { AppConfigService } from '../../config/app-config.service.js';

/** What unpacking a bundle may take (from the team's plan). */
export interface BundleLimits {
  bytes: number;
  files: number;
}

export interface Unpacked {
  sizeBytes: number;
  fileCount: number;
}

const ALLOWED_TYPES = new Set(['File', 'OldFile', 'ContiguousFile', 'Directory']);
const SEGMENT_MAX_BYTES = 255;
const PATH_MAX_BYTES = 1024;

/** A bundle refused, with the reason the developer reads (400, or 413 for its size). */
export class BundleError extends HttpException {
  constructor(message: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super(message, status);
  }
}

/**
 * A path inside a bundle, normalised (`./a/b/` → `a/b`), or an error when it could escape its
 * folder or isn't a plain name. Empty for the bundle's root itself.
 */
export function bundlePath(raw: string): string {
  let path = raw.replace(/^(?:\.\/)+/, '').replace(/\/+$/, '');
  if (path === '.' || path === '') return '';
  if (path.startsWith('/') || path.includes('\\')) throw new BundleError(`Bad path: ${raw}`);
  if (Buffer.byteLength(path) > PATH_MAX_BYTES) throw new BundleError(`Path too long: ${raw}`);
  path = path.replace(/\/{2,}/g, '/');
  for (const part of path.split('/')) {
    if (part === '.' || part === '..' || part === '') throw new BundleError(`Bad path: ${raw}`);
    if (Buffer.byteLength(part) > SEGMENT_MAX_BYTES) throw new BundleError(`Name too long: ${raw}`);
    // Printable characters only: no control characters or DEL.
    if ([...part].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)) {
      throw new BundleError(`Bad character in: ${raw}`);
    }
  }
  return path;
}

/** Host labels: `<slug>` for production and `<slug>--<shortId>` for each deployment. */
export const productionLabel = (slug: string) => slug;
export const deploymentLabel = (slug: string, shortId: string) => `${slug}--${shortId}`;

/**
 * Codeqlick Cloud's files on disk (architecture 8.3): unpacked deployments, the host links Nginx
 * follows, and the custom domains `sync-sites.sh` publishes. The only code that touches them.
 */
@Injectable()
export class CloudStorage {
  constructor(private readonly config: AppConfigService) {}

  /** The hosting domain and root, or 503 while hosting isn't set up. */
  hosting(): { domain: string; root: string } {
    const hosting = this.config.cloudHosting;
    if (!hosting) throw new ServiceUnavailableException('Cloud hosting is not set up yet');
    return hosting;
  }

  get available(): boolean {
    return this.config.cloudHosting !== undefined;
  }

  private dir(...parts: string[]): string {
    return join(this.hosting().root, ...parts);
  }

  private async ensureFolders(): Promise<void> {
    for (const folder of ['deployments', 'hosts', 'domains', 'pages']) {
      await mkdir(this.dir(folder), { recursive: true, mode: 0o755 });
    }
  }

  /**
   * Checks a `tar.gz` bundle and unpacks it as deployment `id`. Only regular files and folders,
   * paths that stay inside, within the limits and with an `index.html` at the root; anything
   * else throws a BundleError and leaves nothing behind.
   */
  async unpack(bundle: string, id: string, limits: BundleLimits): Promise<Unpacked> {
    await this.ensureFolders();
    let declared = 0;
    let files = 0;
    let problem: BundleError | undefined;
    try {
      await list({
        file: bundle,
        strict: true,
        onReadEntry: (entry) => {
          if (problem) return;
          try {
            if (!ALLOWED_TYPES.has(entry.type)) {
              throw new BundleError(
                `Only files and folders are allowed (${entry.path} is a ${entry.type})`,
              );
            }
            bundlePath(entry.path);
            if (entry.type !== 'Directory') {
              files += 1;
              declared += entry.size ?? 0;
            }
            if (files > limits.files) {
              throw new BundleError(
                `More than ${limits.files} files`,
                HttpStatus.PAYLOAD_TOO_LARGE,
              );
            }
            if (declared > limits.bytes) {
              throw new BundleError(
                `More than ${Math.round(limits.bytes / 1024 / 1024)} MB unpacked`,
                HttpStatus.PAYLOAD_TOO_LARGE,
              );
            }
          } catch (error) {
            problem = error instanceof BundleError ? error : new BundleError('Unreadable bundle');
          }
        },
      });
    } catch {
      throw new BundleError('The bundle is not a valid tar.gz');
    }
    if (problem) throw problem;
    if (files === 0) throw new BundleError('The bundle is empty');

    const target = this.dir('deployments', id);
    const work = `${target}.tmp`;
    await rm(work, { recursive: true, force: true });
    await mkdir(work, { recursive: true, mode: 0o755 });
    try {
      await x({
        file: bundle,
        cwd: work,
        strict: true,
        preservePaths: false,
        preserveOwner: false,
        noMtime: true,
        filter: (_path, entry) => 'type' in entry && ALLOWED_TYPES.has(entry.type as string),
      });
      const result = await this.normalise(work);
      try {
        const index = await lstat(join(work, 'index.html'));
        if (!index.isFile()) throw new Error('not a file');
      } catch {
        throw new BundleError('There is no index.html at the root of the folder');
      }
      if (result.sizeBytes > limits.bytes || result.fileCount > limits.files) {
        throw new BundleError('The bundle is larger than declared', HttpStatus.PAYLOAD_TOO_LARGE);
      }
      await rename(work, target);
      return result;
    } catch (error) {
      await rm(work, { recursive: true, force: true });
      if (error instanceof BundleError) throw error;
      throw new BundleError('The bundle could not be unpacked');
    }
  }

  /** Walks an unpacked tree: folders 755, files 644, anything else refused; sums sizes. */
  private async normalise(root: string): Promise<Unpacked> {
    let sizeBytes = 0;
    let fileCount = 0;
    const walk = async (folder: string): Promise<void> => {
      await chmod(folder, 0o755);
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        const path = join(folder, entry.name);
        if (entry.isDirectory()) {
          await walk(path);
        } else if (entry.isFile()) {
          await chmod(path, 0o644);
          sizeBytes += (await lstat(path)).size;
          fileCount += 1;
        } else {
          throw new BundleError('Only files and folders are allowed');
        }
      }
    };
    await walk(root);
    return { sizeBytes, fileCount };
  }

  /**
   * A deployment's folder packed as a `tar.gz` stream, built while it is read (decision 60): its
   * entries by name, so paths are the uploaded ones without `./`, dotfiles included, links never
   * followed. Null when the folder is gone. If a file disappears while packing (the hourly
   * cleanup), the stream fails with that error instead of ending as an incomplete archive.
   */
  async archive(id: string): Promise<Readable | null> {
    const folder = this.dir('deployments', id);
    let entries: string[];
    try {
      entries = (await readdir(folder)).sort();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return null;
      throw error;
    }
    if (entries.length === 0) return null;
    const pack = create(
      { gzip: true, portable: true, strict: true, follow: false, cwd: folder },
      entries,
    );
    const out = new PassThrough();
    pack.on('error', (error) => out.destroy(error as Error));
    out.once('close', () => {
      // The reader went away: let the packer run dry so it closes the files it has open.
      if (!out.writableFinished) {
        pack.unpipe(out);
        pack.resume();
      }
    });
    pack.pipe(out);
    return out;
  }

  /** Points `hosts/<label>` at a deployment, atomically (a new link renamed over the old). */
  async link(label: string, deploymentId: string): Promise<void> {
    await this.replaceLink(label, join('..', 'deployments', deploymentId));
  }

  /** Points `hosts/<label>` at the "suspended" page. */
  async linkSuspended(label: string): Promise<void> {
    await this.replaceLink(label, join('..', 'pages', 'suspended'));
  }

  private async replaceLink(label: string, target: string): Promise<void> {
    await this.ensureFolders();
    const temporary = this.dir('hosts', `.${label}.${randomBytes(6).toString('hex')}`);
    await symlink(target, temporary);
    try {
      await rename(temporary, this.dir('hosts', label));
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async unlinkHost(label: string): Promise<void> {
    if (!this.available) return;
    await rm(this.dir('hosts', label), { force: true });
  }

  async removeDeployment(id: string): Promise<void> {
    if (!this.available) return;
    await rm(this.dir('deployments', id), { recursive: true, force: true });
  }

  /** Asks the host to publish a verified custom domain for the project (`sync-sites.sh`). */
  async writeDomain(domain: string, slug: string): Promise<void> {
    await this.ensureFolders();
    await writeFile(this.dir('domains', domain), `${slug}\n`, { mode: 0o644 });
  }

  async removeDomain(domain: string): Promise<void> {
    if (!this.available) return;
    await rm(this.dir('domains', domain), { force: true });
  }
}
