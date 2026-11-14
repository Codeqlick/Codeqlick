import { randomBytes } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { PassThrough, type Readable } from 'node:stream';
import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { create, list, x } from 'tar';
import { AppConfigService } from '../../config/app-config.service.js';
import {
  RULES_MARKER,
  describeErrors,
  needsMarker,
  parseConfig,
  sizeError,
  type CloudConfig,
  type ConfigError,
  type ConfigLimits,
} from './cloud-config.js';
import { protects, type ProtectionMode } from './cloud-protection.js';

/** What unpacking a bundle may take (from the team's plan). */
export interface BundleLimits {
  bytes: number;
  files: number;
  /**
   * `codeqlick.json` (architecture 4.13): the text sent next to the bundle (it wins over the
   * bundle's own file) and the plan's limits. Without it the file is deleted but not read.
   */
  config?: { text?: string; limits: ConfigLimits; plan: string };
}

export interface Unpacked {
  sizeBytes: number;
  fileCount: number;
  /** The parsed rules, null when the deployment has none. */
  config: CloudConfig | null;
}

const CONFIG_FILE = 'codeqlick.json';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ALLOWED_TYPES = new Set(['File', 'OldFile', 'ContiguousFile', 'Directory']);
const SEGMENT_MAX_BYTES = 255;
const PATH_MAX_BYTES = 1024;

/** A bundle refused, with the reason the developer reads (400, or 413 for its size). */
export class BundleError extends HttpException {
  /** Each problem of an invalid `codeqlick.json` (the problem body lists them). */
  readonly errors?: ConfigError[];

  constructor(
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    errors?: ConfigError[],
  ) {
    super(errors ? { message, detail: message, errors } : message, status);
    this.errors = errors;
  }
}

/** An invalid `codeqlick.json`: the first problem is the message, all of them the `errors`. */
export function configProblem(errors: ConfigError[]): BundleError {
  return new BundleError(describeErrors(errors), HttpStatus.BAD_REQUEST, errors);
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

/** A file or folder that isn't there (any more). */
function isMissing(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
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
    // The sent `config` is checked first: a refused file costs no unpacking.
    let sent: { config: CloudConfig | null } | undefined;
    if (limits.config?.text?.trim()) {
      const parsed = parseConfig(limits.config.text, limits.config.limits, limits.config.plan);
      if (!parsed.ok) throw configProblem(parsed.errors);
      sent = { config: parsed.config };
    }
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
            const path = bundlePath(entry.path);
            if (path.split('/').some((part) => part.startsWith('.cq-'))) {
              throw new BundleError(
                `Names starting with .cq- are reserved for Codeqlick Cloud (${entry.path})`,
              );
            }
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
      const config = await this.readConfig(work, limits.config, sent);
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
      // Only the API writes the marker, so an upload can't fake it (it is never in the bundle).
      if (needsMarker(config)) await writeFile(join(work, RULES_MARKER), '', { mode: 0o644 });
      await rename(work, target);
      return { ...result, config };
    } catch (error) {
      await rm(work, { recursive: true, force: true });
      if (error instanceof BundleError) throw error;
      throw new BundleError('The bundle could not be unpacked');
    }
  }

  /**
   * Takes `codeqlick.json` out of an unpacked bundle (it is never served: neither the link keys
   * nor the rules are public) and checks it, the sent text first, the bundle's own otherwise.
   */
  private async readConfig(
    work: string,
    options: BundleLimits['config'],
    sent: { config: CloudConfig | null } | undefined,
  ): Promise<CloudConfig | null> {
    const file = join(work, CONFIG_FILE);
    try {
      if (sent) return sent.config;
      let source: string | undefined;
      if (options) {
        const info = await lstat(file).catch(() => null);
        if (info?.isFile()) {
          if (info.size > options.limits.bytes) {
            throw configProblem([sizeError(info.size, options.limits, options.plan)]);
          }
          source = await readFile(file, 'utf8');
        }
      }
      if (source === undefined || !options) return null;
      const parsed = parseConfig(source, options.limits, options.plan);
      if (!parsed.ok) throw configProblem(parsed.errors);
      return parsed.config;
    } finally {
      await rm(file, { recursive: true, force: true });
    }
  }

  /** Walks an unpacked tree: folders 755, files 644, anything else refused; sums sizes. */
  private async normalise(root: string): Promise<Omit<Unpacked, 'config'>> {
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
   * entries by name, so paths are the uploaded ones without `./` (except names starting with `@`,
   * which tar would read as archives to append), dotfiles included, links never followed.
   * Resolves once the first bytes are ready, so an early failure is an ordinary error; null when
   * the folder is gone. If a file disappears later (the hourly cleanup), the stream fails with
   * that error instead of ending as an incomplete archive.
   */
  async archive(id: string): Promise<Readable | null> {
    const folder = this.dir('deployments', id);
    let names: string[];
    try {
      names = (await readdir(folder)).sort();
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    if (names.length === 0) return null;
    const entries = names.map((name) => (name.startsWith('@') ? `./${name}` : name));
    const pack = create(
      { gzip: true, portable: true, strict: true, follow: false, cwd: folder },
      entries,
    );
    const out = new PassThrough();
    out.once('close', () => {
      // The reader went away (or packing failed): let the packer run dry so it closes its files.
      if (!out.writableFinished) {
        pack.unpipe(out);
        pack.resume();
      }
    });
    pack.pipe(out);
    let started = false;
    const ready = new Promise<void>((resolve, reject) => {
      pack.on('error', (error) => {
        // Before the first bytes the caller gets the error; after, the reader's stream fails.
        out.destroy(started ? (error as Error) : undefined);
        reject(error as Error);
      });
      pack.once('data', () => {
        started = true;
        resolve();
      });
    });
    try {
      await ready;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
    // A failure before Nest pipes the stream (while the event is recorded) must not crash the
    // process; Nest's own handler takes over once it pipes, and the connection is cut.
    out.on('error', () => undefined);
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

  /**
   * Is `path` (such as `/about.html`) a regular file of deployment `id`? The edge check's own
   * read-only look at the files; never leaves the deployment's folder.
   */
  async isFile(id: string, path: string): Promise<boolean> {
    if (!this.available || !UUID.test(id) || !path.startsWith('/') || path.includes('\0')) {
      return false;
    }
    const root = resolve(this.dir('deployments', id));
    const full = resolve(root, `.${path}`);
    if (!full.startsWith(root + sep)) return false;
    return stat(full).then(
      (info) => info.isFile(),
      () => false,
    );
  }

  /** Writes the `.cq-rules` marker of the deployments whose rules need it and lack it (hourly). */
  async reconcileRules(
    deployments: Array<{ id: string; config: CloudConfig | null }>,
  ): Promise<void> {
    if (!this.available) return;
    for (const deployment of deployments) {
      if (!needsMarker(deployment.config)) continue;
      const folder = this.dir('deployments', deployment.id);
      const exists = await lstat(folder).then(
        (info) => info.isDirectory(),
        () => false,
      );
      if (!exists) continue;
      const marker = join(folder, RULES_MARKER);
      const marked = await lstat(marker).then(
        () => true,
        () => false,
      );
      if (!marked) await writeFile(marker, '', { mode: 0o644 });
    }
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

  // ── Password protection's markers (architecture 4.13, decision 50) ────────────────────────

  /** The marker files a mode needs: `<slug>.previews` and, for `ALL`, `<slug>.production`. */
  private markers(slug: string, mode: ProtectionMode): Array<{ name: string; wanted: boolean }> {
    return [
      { name: `${slug}.previews`, wanted: protects(mode, 'previews') },
      { name: `${slug}.production`, wanted: protects(mode, 'production') },
    ];
  }

  /** Writes or removes the project's markers for its mode; nothing while hosting isn't set up. */
  async writeProtection(slug: string, mode: ProtectionMode): Promise<void> {
    if (!this.available) return;
    await mkdir(this.dir('protect'), { recursive: true, mode: 0o755 });
    for (const marker of this.markers(slug, mode)) {
      const path = this.dir('protect', marker.name);
      if (marker.wanted) await writeFile(path, '', { mode: 0o644 });
      else await rm(path, { force: true });
    }
  }

  async removeProtection(slug: string): Promise<void> {
    await this.writeProtection(slug, 'OFF');
  }

  /**
   * Puts the markers right against the database: the protected projects' are written, any other
   * marker is removed (hourly and at start), unless it was written after `readAt`, when the
   * projects were read.
   */
  async reconcileProtection(
    projects: Array<{ slug: string; protection: ProtectionMode }>,
    readAt: Date,
  ): Promise<void> {
    if (!this.available) return;
    await mkdir(this.dir('protect'), { recursive: true, mode: 0o755 });
    const wanted = new Set<string>();
    for (const project of projects) {
      for (const marker of this.markers(project.slug, project.protection)) {
        if (marker.wanted) wanted.add(marker.name);
      }
    }
    for (const name of await readdir(this.dir('protect'))) {
      if (!name.endsWith('.previews') && !name.endsWith('.production')) continue;
      if (wanted.has(name)) continue;
      // A marker written since the database was read belongs to a change this read didn't see:
      // it stays until the next check (2 s of slack for coarse file times).
      const path = this.dir('protect', name);
      const written = await lstat(path).then(
        (stat) => stat.mtimeMs,
        () => null,
      );
      if (written === null || written > readAt.getTime() - 2000) continue;
      await rm(path, { force: true });
    }
    for (const name of wanted) await writeFile(this.dir('protect', name), '', { mode: 0o644 });
  }
}
