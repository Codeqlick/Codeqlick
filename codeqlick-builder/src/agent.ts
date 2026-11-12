import { spawn } from 'node:child_process';
import { openAsBlob } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { dockerArgs, envFile, inside, mask, type Job } from './plan.ts';

/**
 * Codeqlick Cloud's build agent (architecture 8.4, decision 41). It asks the API for a build every
 * 5 seconds, clones the commit, runs install and build in a throwaway container, streams the log,
 * and uploads the output folder. It needs no open port and keeps nothing between builds.
 */

const API = (process.env.CLOUD_API_URL ?? 'https://api.codeqlick.com/v1').replace(/\/+$/, '');
const TOKEN = process.env.CLOUD_BUILDER_TOKEN ?? '';
const WORK = process.env.BUILDER_WORK_DIR ?? '/var/lib/codeqlick-builder';
const NAME = (process.env.BUILDER_NAME ?? hostname()).slice(0, 60);
const POLL_MS = 5_000;

if (!TOKEN) {
  console.error('CLOUD_BUILDER_TOKEN is not set');
  process.exit(1);
}

class Canceled extends Error {}

async function api(
  path: string,
  init: { method?: string; json?: unknown; form?: FormData } = {},
): Promise<Response> {
  const headers: Record<string, string> = { Authorization: `Bearer ${TOKEN}` };
  let body: string | FormData | undefined;
  if (init.form) body = init.form;
  else if (init.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(init.json);
  }
  return fetch(`${API}${path}`, {
    method: init.method ?? 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(120_000),
  });
}

/** Runs a command, sending its output to `onOutput`; resolves with its exit code. */
function run(
  command: string,
  args: string[],
  options: { cwd?: string; onOutput: (text: string) => void; signal?: AbortSignal },
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (data: Buffer) => options.onOutput(data.toString('utf8')));
    child.stderr.on('data', (data: Buffer) => options.onOutput(data.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
    options.signal?.addEventListener('abort', () => child.kill('SIGKILL'), { once: true });
  });
}

async function build(job: Job): Promise<void> {
  const work = join(WORK, job.id);
  const src = join(work, 'src');
  const container = `cqb-${job.id.slice(0, 12)}`;
  let buffer = '';
  let canceled = false;
  const output = (text: string) => {
    buffer += mask(text, job.secrets);
  };
  const flush = async () => {
    if (!buffer) return;
    const text = buffer;
    buffer = '';
    const response = await api(`/cloud/builder/builds/${job.id}/log`, { json: { text } }).catch(
      () => null,
    );
    if (response?.status === 409) canceled = true;
  };
  const flusher = setInterval(() => void flush(), 2_000);
  const beat = setInterval(() => {
    void api(`/cloud/builder/builds/${job.id}/heartbeat`).then((r) => {
      if (r.status === 409) canceled = true;
    });
  }, 30_000);
  const stop = new AbortController();
  const watcher = setInterval(() => {
    if (canceled && !stop.signal.aborted) {
      stop.abort();
      void run('docker', ['kill', container], { onOutput: () => undefined }).catch(() => undefined);
    }
  }, 1_000);
  const finish = async (status: 'succeeded' | 'failed', error?: string, bundle?: string) => {
    await flush();
    const form = new FormData();
    form.set('status', status);
    if (error) form.set('error', error.slice(0, 500));
    if (bundle)
      form.set('bundle', await openAsBlob(bundle, { type: 'application/gzip' }), 'out.tar.gz');
    await api(`/cloud/builder/builds/${job.id}/finish`, { form }).catch((e: unknown) =>
      console.error(`build ${job.id}: finish failed: ${String(e)}`),
    );
  };

  try {
    await mkdir(src, { recursive: true, mode: 0o700 });
    output(`$ git fetch ${job.commit.slice(0, 7)}\n`);
    for (const args of [
      ['init', '-q'],
      ['remote', 'add', 'origin', job.cloneUrl],
      ['-c', 'credential.helper=', 'fetch', '-q', '--depth', '1', 'origin', job.commit],
      ['checkout', '-q', 'FETCH_HEAD'],
    ]) {
      if ((await run('git', args, { cwd: src, onOutput: output })) !== 0)
        throw new Error('The repository could not be fetched');
    }
    // The token stays out of the container: the remote is removed before building.
    await run('git', ['remote', 'remove', 'origin'], { cwd: src, onOutput: () => undefined });
    await rm(join(src, '.git', 'FETCH_HEAD'), { force: true });
    const root = inside(src, job.rootDir);
    const variables = join(work, 'env');
    await writeFile(variables, envFile(job.env), { mode: 0o600 });
    const command = `${job.installCommand} && ${job.buildCommand}`;
    output(`$ ${command}\n`);
    const timer = setTimeout(() => {
      output(
        `\nThe build took longer than ${Math.round(job.timeoutSeconds / 60)} minutes: stopped.\n`,
      );
      stop.abort();
      void run('docker', ['kill', container], { onOutput: () => undefined }).catch(() => undefined);
    }, job.timeoutSeconds * 1000);
    const code = await run(
      'docker',
      dockerArgs({
        name: container,
        work: src,
        rootDir: job.rootDir,
        envFile: variables,
        nodeVersion: job.nodeVersion,
        uid: process.getuid?.() ?? 1000,
        gid: process.getgid?.() ?? 1000,
        command,
      }),
      { onOutput: output, signal: stop.signal },
    );
    clearTimeout(timer);
    if (canceled) throw new Canceled('Canceled');
    if (stop.signal.aborted)
      throw new Error(`The build took longer than ${Math.round(job.timeoutSeconds / 60)} minutes`);
    if (code !== 0) throw new Error(`The build exited with code ${code}`);

    const out = inside(root, job.outputDir);
    if (!(await stat(out).catch(() => null))?.isDirectory())
      throw new Error(`The output folder ${job.outputDir || '.'} doesn't exist`);
    const bundle = join(work, 'out.tar.gz');
    if ((await run('tar', ['-czf', bundle, '-C', out, '.'], { onOutput: output })) !== 0) {
      throw new Error('The output folder could not be packed');
    }
    output('Uploading the output…\n');
    await finish('succeeded', undefined, bundle);
  } catch (error) {
    if (error instanceof Canceled) {
      await flush();
    } else {
      const message = error instanceof Error ? error.message : String(error);
      output(`\n${message}\n`);
      await finish('failed', message);
    }
  } finally {
    clearInterval(flusher);
    clearInterval(beat);
    clearInterval(watcher);
    await rm(work, { recursive: true, force: true });
  }
}

let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
});

console.log(`codeqlick-builder ${NAME}: claiming builds from ${API}`);
while (!stopping) {
  try {
    const response = await api('/cloud/builder/claim', { json: { builder: NAME } });
    if (response.status === 200) {
      const { build: job } = (await response.json()) as { build: Job };
      console.log(`build ${job.id}: ${job.commit.slice(0, 7)}`);
      await build(job);
      console.log(`build ${job.id}: done`);
      continue;
    }
    if (response.status !== 204) console.error(`claim: HTTP ${response.status}`);
  } catch (error) {
    console.error(`claim failed: ${String(error)}`);
  }
  await sleep(POLL_MS);
}
