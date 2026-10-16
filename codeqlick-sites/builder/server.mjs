// The site builder: builds managed client sites from the web-basica template and publishes them
// as releases under SITES_DIR/<slug>. Internal only (the API calls it inside the Docker network).
//
//   GET  /health            { ok: true }
//   GET  /presets           { presets: [{ key, content }] }: the demos, as starting content
//   POST /build             Bearer SITE_BUILDER_TOKEN; { slug, preset, domains, content }
//                           -> { ok: true, release, ms } or { ok: false, error }
//   DELETE /sites/:slug     Bearer; marks the site for removal (deploy/sites/sync-sites.sh)
//                           -> { ok: true, removed }
//
// Images in the content are `file` names: `media/<name>` comes from the API's uploads (read-only
// mount), anything else from the preset's images. Builds run one at a time.
import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { copyFile, cp, mkdir, readdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const TEMPLATE = process.env.TEMPLATE_DIR ?? '/app/web-basica';
const SITES = process.env.SITES_DIR ?? '/srv/codeqlick/sites';
const UPLOADS = process.env.UPLOADS_DIR ?? '/uploads';
const WORK = process.env.WORK_DIR ?? join(TEMPLATE, '.work');
const TOKEN = process.env.SITE_BUILDER_TOKEN ?? '';
const PORT = Number(process.env.PORT ?? 4100);
const KEEP_RELEASES = 5;
const BUILD_TIMEOUT_MS = 180_000;
export const PRESETS = [
  'peluqueria',
  'restaurante',
  'fisioterapia',
  'portfolio',
  'despacho',
  'comercio',
  'reformas',
  'general',
];

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const DOMAIN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const IMAGE = /^[\w-]{1,100}\.(?:jpe?g|png|webp|avif)$/i;

class BuildError extends Error {}

/** Every image a site uses, so they can be copied next to its content. */
function imagesOf(content) {
  return [content.hero?.image, content.about?.image, ...(content.gallery?.images ?? [])].filter(
    (image) => image && typeof image.file === 'string',
  );
}

/** Copies the images into the work folder; `media/<name>` becomes `<name>` in the content. */
async function copyImages(content, preset, imagesDir) {
  for (const image of imagesOf(content)) {
    const fromMedia = image.file.startsWith('media/');
    const name = fromMedia ? image.file.slice('media/'.length) : image.file;
    if (!IMAGE.test(name)) throw new BuildError(`Invalid image name: ${image.file}`);
    const source = fromMedia
      ? join(UPLOADS, name)
      : join(TEMPLATE, 'examples', preset, 'images', name);
    try {
      await copyFile(source, join(imagesDir, name));
    } catch {
      throw new BuildError(`Image not found: ${image.file}`);
    }
    image.file = name;
  }
}

function run(command, args, options) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const keep = (chunk) => {
      output = (output + chunk.toString()).slice(-20_000);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => child.kill('SIGKILL'), BUILD_TIMEOUT_MS);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

async function build({ slug, preset, domains, content }) {
  const started = Date.now();
  if (typeof slug !== 'string' || !SLUG.test(slug)) throw new BuildError('Invalid slug');
  if (!PRESETS.includes(preset)) throw new BuildError('Invalid preset');
  if (!Array.isArray(domains) || domains.length === 0 || !domains.every((d) => DOMAIN.test(d))) {
    throw new BuildError('Invalid domains');
  }
  if (!content || typeof content !== 'object' || typeof content.url !== 'string') {
    throw new BuildError('Invalid content');
  }

  const work = join(WORK, slug);
  await rm(work, { recursive: true, force: true });
  await mkdir(join(work, 'images'), { recursive: true });
  const site = structuredClone(content);
  await copyImages(site, preset, join(work, 'images'));
  await writeFile(join(work, 'site.ts'), `export default ${JSON.stringify(site, null, 2)};\n`);

  const dist = join(TEMPLATE, 'dist');
  await rm(dist, { recursive: true, force: true });
  const result = await run(join(TEMPLATE, 'node_modules', '.bin', 'astro'), ['build'], {
    cwd: TEMPLATE,
    env: { ...process.env, SITE_DIR: work, SITE_URL: content.url, ASTRO_TELEMETRY_DISABLED: '1' },
  });
  if (result.code !== 0) throw new BuildError(result.output.split('\n').slice(-25).join('\n'));

  const release = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const root = join(SITES, slug);
  await mkdir(join(root, 'releases'), { recursive: true });
  await cp(dist, join(root, 'releases', release), { recursive: true });
  // Swap `current` in one step: Nginx serves either the old release or the new one.
  await rm(join(root, 'current.new'), { force: true });
  await symlink(join('releases', release), join(root, 'current.new'));
  await rename(join(root, 'current.new'), join(root, 'current'));
  const releases = (await readdir(join(root, 'releases'))).sort();
  for (const old of releases.slice(0, -KEEP_RELEASES)) {
    await rm(join(root, 'releases', old), { recursive: true, force: true });
  }
  // Read by deploy/sites/sync-sites.sh on the host, which publishes the domains through Nginx.
  await writeFile(join(root, 'domains'), `${domains.join('\n')}\n`);
  // Built again: no longer on its way out.
  await rm(join(root, 'remove'), { force: true });
  await rm(work, { recursive: true, force: true });
  return { ok: true, release, ms: Date.now() - started };
}

/**
 * Marks a site for removal: the host's sync-sites.sh unpublishes its domains and deletes the
 * folder. The API only asks this for request previews.
 */
async function remove(slug) {
  if (!SLUG.test(slug)) throw new BuildError('Invalid slug');
  const root = join(SITES, slug);
  try {
    await stat(root);
  } catch {
    return { ok: true, removed: false };
  }
  await writeFile(join(root, 'remove'), `${new Date().toISOString()}\n`);
  return { ok: true, removed: true };
}

async function presets() {
  const list = [];
  for (const key of PRESETS) {
    const url = pathToFileURL(join(TEMPLATE, 'examples', key, 'site.ts')).href;
    list.push({ key, content: (await import(url)).default });
  }
  return { presets: list };
}

function authorized(header) {
  if (!TOKEN) return false;
  const given = Buffer.from(header?.startsWith('Bearer ') ? header.slice(7) : '');
  const expected = Buffer.from(TOKEN);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

let queue = Promise.resolve();

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true });
    if (!authorized(req.headers.authorization)) return send(res, 401, { ok: false, error: 'Unauthorized' });
    if (req.method === 'GET' && req.url === '/presets') return send(res, 200, await presets());
    if (req.method === 'POST' && req.url === '/build') {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1_000_000) return send(res, 413, { ok: false, error: 'Too large' });
        chunks.push(chunk);
      }
      const input = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      const job = queue.then(() => build(input));
      queue = job.catch(() => undefined);
      try {
        return send(res, 200, await job);
      } catch (error) {
        if (error instanceof BuildError) return send(res, 422, { ok: false, error: error.message });
        throw error;
      }
    }
    const removal = req.method === 'DELETE' && /^\/sites\/([^/]+)$/.exec(req.url ?? '');
    if (removal) {
      try {
        return send(res, 200, await remove(decodeURIComponent(removal[1])));
      } catch (error) {
        if (error instanceof BuildError) return send(res, 422, { ok: false, error: error.message });
        throw error;
      }
    }
    return send(res, 404, { ok: false, error: 'Not found' });
  } catch (error) {
    console.error(error);
    return send(res, 500, { ok: false, error: 'Build failed' });
  }
});

server.listen(PORT, () => console.log(`site-builder listening on ${PORT}`));
