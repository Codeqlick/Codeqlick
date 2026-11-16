import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, test } from 'node:test';
import { main } from './cli.ts';

const PASSWORD = 'Pw' + 'x'.repeat(30);
const project = { id: 'p-1', slug: 'docs', name: 'Docs', team: { slug: 'acme', name: 'Acme' } };
const database = {
  id: 'd1',
  name: 'main',
  host: 'pg.codeqlick.app',
  port: 5432,
  database: 'cq_aa',
  user: 'cq_aa',
  sizeBytes: 1024,
  maxBytes: 256 * 1024 * 1024,
  readOnly: false,
  connectionUrl: 'postgresql://cq_aa@pg.codeqlick.app:5432/cq_aa?sslmode=require',
  createdAt: '2026-11-15T10:00:00Z',
};
const withPassword = {
  ...database,
  password: PASSWORD,
  connectionUrl: `postgresql://cq_aa:${PASSWORD}@pg.codeqlick.app:5432/cq_aa?sslmode=require`,
};
const key = {
  id: 'k1',
  name: 'site',
  accessKeyId: 'GK01',
  write: false,
  createdAt: '2026-11-15T10:00:00Z',
};
const bucket = {
  id: 'b1',
  name: 'assets',
  endpoint: 'https://s3.codeqlick.app',
  region: 'garage',
  sizeBytes: 0,
  objects: 0,
  maxBytes: 1024 ** 3,
  maxObjects: 100_000,
  public: false,
  publicUrl: null,
  cors: null,
  keys: [key],
  createdAt: '2026-11-15T10:00:00Z',
};

let databases: { configured: boolean; items: unknown[] } = { configured: true, items: [] };
const calls: Array<{ call: string; body: unknown }> = [];
let base = '';

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((done) => {
    let text = '';
    req.on('data', (chunk) => (text += chunk));
    req.on('end', () => done(text ? JSON.parse(text) : undefined));
  });
}

const server = createServer(async (req, res) => {
  const body = await readBody(req);
  const call = `${req.method} ${req.url}`;
  calls.push({ call, body });
  const send = (status: number, data?: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(data === undefined ? undefined : JSON.stringify(data));
  };
  const p = '/cloud/projects/p-1';
  switch (call) {
    case 'GET /cloud/teams/acme/projects':
      return send(200, { items: [project] });
    case `GET ${p}/databases`:
      return send(200, databases);
    case `POST ${p}/databases`:
      return send(201, { ...withPassword, name: (body as { name: string }).name });
    case `POST ${p}/databases/d1/password`:
      return send(200, withPassword);
    case `DELETE ${p}/databases/d1`:
    case `DELETE ${p}/buckets/b1`:
    case `DELETE ${p}/buckets/b1/keys/k1`:
      return send(204);
    case `GET ${p}/buckets`:
      return send(200, {
        configured: true,
        endpoint: bucket.endpoint,
        region: bucket.region,
        publicLimit: 1,
        publicCount: 0,
        items: [bucket],
      });
    case `POST ${p}/buckets`: {
      const name = (body as { name: string }).name;
      if (name === 'taken') return send(409, { detail: 'That bucket name is taken.' });
      return send(201, { ...bucket, id: 'b2', name, keys: [] });
    }
    case `POST ${p}/buckets/b1/keys`:
      return send(201, { ...key, id: 'k2', ...(body as object), secretAccessKey: 'SECRET' });
    case `PATCH ${p}/buckets/b1`: {
      const change = body as { public?: boolean; cors?: unknown };
      const isPublic = change.public ?? bucket.public;
      return send(200, {
        ...bucket,
        public: isPublic,
        publicUrl: isPublic ? 'https://s3.codeqlick.app/_public/assets/' : null,
        cors:
          change.cors === undefined
            ? bucket.cors
            : change.cors && {
                methods: ['GET', 'HEAD'],
                headers: ['*'],
                exposeHeaders: ['ETag'],
                maxAge: 3600,
                ...change.cors,
              },
      });
    }
    default:
      return send(404, { detail: 'not found' });
  }
});

before(async () => {
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.CODEQLICK_API_URL = base;
  process.env.CODEQLICK_TOKEN = 'cqk_test';
  // As in CI: no terminal to answer a question.
  Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
});
after(() => {
  server.close();
});
beforeEach(() => {
  calls.length = 0;
  databases = { configured: true, items: [database] };
});

/** Runs the CLI, capturing what it prints on standard output and standard error. */
async function run(...args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const log = console.log;
  const error = console.error;
  console.log = (...parts: unknown[]) => void out.push(parts.join(' '));
  console.error = (...parts: unknown[]) => void err.push(parts.join(' '));
  try {
    const code = await main([...args, '--team', 'acme', '--project', 'docs']);
    return { code, out: out.join('\n'), err: err.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

const sent = (call: string) => calls.find((c) => c.call === call);

test('db ls prints a table, --json the API answer, and says when it is not set up', async () => {
  const table = await run('db', 'ls');
  assert.equal(table.code, 0);
  assert.match(table.out, /NAME\s+SIZE\s+READ-ONLY\s+CONNECTION/);
  assert.match(table.out, /main\s+1\.0 KB \/ 256\.0 MB\s+no\s+postgresql:\/\/cq_aa@/);
  const json = await run('db', '--json');
  assert.deepEqual(JSON.parse(json.out), { configured: true, items: [database] });
  databases = { configured: true, items: [] };
  assert.match((await run('db')).out, /No databases yet/);
  databases = { configured: false, items: [] };
  assert.match((await run('db', 'ls')).out, /aren't set up/);
  const refused = await run('db', 'rm', 'main', '--yes');
  assert.equal(refused.code, 1);
  assert.match(refused.err, /aren't set up/);
});

test('db create prints the full URL once', async () => {
  const result = await run('db', 'create', 'main');
  assert.equal(result.code, 0);
  assert.deepEqual(sent('POST /cloud/projects/p-1/databases')?.body, { name: 'main' });
  assert.ok(result.out.includes(withPassword.connectionUrl));
  assert.match(result.out, /won't be shown again/);
  const json = await run('db', 'create', 'main', '--json');
  assert.equal(JSON.parse(json.out).password, PASSWORD);
});

test('db url and db rm refuse without a terminal unless --yes', async () => {
  for (const args of [
    ['db', 'url', 'main'],
    ['db', 'rm', 'main'],
  ]) {
    const result = await run(...args);
    assert.equal(result.code, 1);
    assert.match(result.err, /Pass --yes to confirm\./);
  }
  assert.ok(!calls.some((c) => c.call.startsWith('POST') || c.call.startsWith('DELETE')));
  const url = await run('db', 'url', 'main', '--yes');
  assert.equal(url.code, 0);
  assert.equal(url.out, withPassword.connectionUrl);
  assert.ok(sent('POST /cloud/projects/p-1/databases/d1/password'));
  const rm = await run('db', 'rm', 'd1', '-y', '--json');
  assert.equal(rm.code, 0);
  assert.deepEqual(JSON.parse(rm.out), {});
  assert.ok(sent('DELETE /cloud/projects/p-1/databases/d1'));
});

test('db names: unknown and ambiguous are errors', async () => {
  const missing = await run('db', 'rm', 'nope', '--yes');
  assert.equal(missing.code, 1);
  assert.equal(missing.err, 'There is no database "nope" in docs.');
  databases = { configured: true, items: [database, { ...database, id: 'd2' }] };
  const twice = await run('db', 'url', 'main', '--yes');
  assert.equal(twice.code, 1);
  assert.match(twice.err, /^2 databases are named "main": use an id\.\n {2}d1 .*\n {2}d2 /);
});

test('db usage errors', async () => {
  assert.match((await run('db', 'drop', 'x')).err, /Unknown action "drop"/);
  assert.match((await run('db', 'create')).err, /Which database\?/);
  assert.match((await run('db', 'url', 'main', '--reset')).err, /--reset goes with "db psql"/);
});

test('db psql runs psql with the URL; --reset passes the password only in PGPASSWORD', async (t) => {
  if (process.platform === 'win32') return t.skip('a shell script stands in for psql');
  const dir = await mkdtemp(join(tmpdir(), 'cq-psql-'));
  const out = join(dir, 'out.txt');
  await writeFile(
    join(dir, 'psql'),
    `#!/bin/sh\nprintf 'args=%s\\npw=%s\\n' "$*" "$PGPASSWORD" > "${out}"\nexit 3\n`,
  );
  await chmod(join(dir, 'psql'), 0o755);
  const path = process.env.PATH;
  const pw = process.env.PGPASSWORD;
  delete process.env.PGPASSWORD;
  process.env.PATH = dir;
  try {
    const plain = await run('db', 'psql', 'main');
    assert.equal(plain.code, 3);
    assert.equal(await readFile(out, 'utf8'), `args=${database.connectionUrl}\npw=\n`);
    assert.ok(!sent('POST /cloud/projects/p-1/databases/d1/password'));

    const refused = await run('db', 'psql', 'main', '--reset');
    assert.equal(refused.code, 1);
    assert.match(refused.err, /Pass --yes/);

    const reset = await run('db', 'psql', 'main', '--reset', '--yes');
    assert.equal(reset.code, 3);
    const seen = await readFile(out, 'utf8');
    assert.equal(seen, `args=${database.connectionUrl}\npw=${PASSWORD}\n`);
    assert.ok(!seen.split('\n')[0]!.includes(PASSWORD));

    process.env.PATH = join(dir, 'nowhere');
    const missing = await run('db', 'psql', 'main');
    assert.equal(missing.code, 1);
    assert.match(missing.err, /psql isn't installed/);
  } finally {
    process.env.PATH = path;
    if (pw !== undefined) process.env.PGPASSWORD = pw;
    await rm(dir, { recursive: true, force: true });
  }
});

test('buckets ls shows the endpoint once and a table; --json the API answer', async () => {
  const result = await run('buckets');
  assert.equal(result.code, 0);
  assert.match(
    result.out,
    /^Endpoint https:\/\/s3\.codeqlick\.app · region garage · 0 of 1 public/,
  );
  assert.match(result.out, /assets\s+0 B \/ 1\.0 GB\s+0 \/ 100,000\s+1\s+-\s+no/);
  const json = await run('buckets', 'ls', '--json');
  assert.equal(JSON.parse(json.out).items[0].id, 'b1');
});

test('buckets keys, key create (read-only by default) and key rm', async () => {
  assert.match((await run('buckets', 'keys', 'assets')).out, /site\s+GK01\s+read-only/);
  assert.deepEqual(JSON.parse((await run('buckets', 'keys', 'b1', '--json')).out), [key]);

  const created = await run('buckets', 'key', 'create', 'assets');
  assert.equal(created.code, 0);
  assert.deepEqual(sent('POST /cloud/projects/p-1/buckets/b1/keys')?.body, {
    name: 'cli',
    write: false,
  });
  assert.match(created.out, /secret access key\s+SECRET/);
  assert.match(created.out, /endpoint\s+https:\/\/s3\.codeqlick\.app/);
  calls.length = 0;
  const json = await run('buckets', 'key', 'create', 'assets', '--name', 'ci', '--write', '--json');
  assert.deepEqual(sent('POST /cloud/projects/p-1/buckets/b1/keys')?.body, {
    name: 'ci',
    write: true,
  });
  assert.equal(JSON.parse(json.out).secretAccessKey, 'SECRET');

  assert.match((await run('buckets', 'key', 'rm', 'assets', 'GK01')).err, /Pass --yes/);
  assert.ok(!sent('DELETE /cloud/projects/p-1/buckets/b1/keys/k1'));
  const removed = await run('buckets', 'key', 'rm', 'assets', 'site', '--yes');
  assert.equal(removed.code, 0);
  assert.ok(sent('DELETE /cloud/projects/p-1/buckets/b1/keys/k1'));
  assert.equal(
    (await run('buckets', 'key', 'rm', 'assets', 'nope', '--yes')).err,
    'There is no key "nope" in the bucket assets.',
  );
});

test('buckets public on asks first and prints the address; off does not ask', async () => {
  const refused = await run('buckets', 'public', 'assets', 'on');
  assert.equal(refused.code, 1);
  assert.match(refused.err, /Anyone with the address will be able to read every file in assets/);
  assert.ok(!sent('PATCH /cloud/projects/p-1/buckets/b1'));
  const on = await run('buckets', 'public', 'assets', 'on', '--yes');
  assert.equal(on.code, 0);
  assert.deepEqual(sent('PATCH /cloud/projects/p-1/buckets/b1')?.body, { public: true });
  assert.match(on.out, /https:\/\/s3\.codeqlick\.app\/_public\/assets\//);
  calls.length = 0;
  const off = await run('buckets', 'public', 'assets', 'off', '--json');
  assert.equal(off.code, 0);
  assert.deepEqual(sent('PATCH /cloud/projects/p-1/buckets/b1')?.body, { public: false });
  assert.equal(JSON.parse(off.out).public, false);
  assert.match((await run('buckets', 'public', 'assets', 'maybe')).err, /on\|off/);
});

test('buckets cors shows, sets and clears the rule', async () => {
  assert.match((await run('buckets', 'cors', 'assets')).out, /No CORS rule/);
  assert.equal((await run('buckets', 'cors', 'assets', '--json')).out, 'null');
  const set = await run(
    'buckets',
    'cors',
    'assets',
    'set',
    'https://example.com',
    'http://localhost:3000',
    '--methods',
    'get,head,put',
    '--max-age',
    '600',
  );
  assert.equal(set.code, 0);
  assert.deepEqual(sent('PATCH /cloud/projects/p-1/buckets/b1')?.body, {
    cors: {
      origins: ['https://example.com', 'http://localhost:3000'],
      methods: ['GET', 'HEAD', 'PUT'],
      maxAge: 600,
    },
  });
  assert.match(set.out, /origins\s+https:\/\/example\.com, http:\/\/localhost:3000/);
  calls.length = 0;
  const cleared = await run('buckets', 'cors', 'assets', 'clear', '--json');
  assert.deepEqual(sent('PATCH /cloud/projects/p-1/buckets/b1')?.body, { cors: null });
  assert.equal(JSON.parse(cleared.out).cors, null);
  const bad = await run('buckets', 'cors', 'assets', 'set', '*', '--methods', 'PATCH');
  assert.equal(bad.code, 1);
  assert.match(bad.err, /--methods/);
});

test('buckets create and rm', async () => {
  const created = await run('buckets', 'create', 'media', '--json');
  assert.equal(created.code, 0);
  assert.deepEqual(sent('POST /cloud/projects/p-1/buckets')?.body, { name: 'media' });
  assert.equal(JSON.parse(created.out).name, 'media');
  const taken = await run('buckets', 'create', 'taken');
  assert.equal(taken.code, 1);
  assert.equal(taken.err, 'That bucket name is taken.');
  assert.match((await run('buckets', 'rm', 'assets')).err, /Pass --yes/);
  const removed = await run('buckets', 'rm', 'assets', '--yes');
  assert.equal(removed.code, 0);
  assert.ok(sent('DELETE /cloud/projects/p-1/buckets/b1'));
  assert.equal(
    (await run('buckets', 'rm', 'other', '--yes')).err,
    'There is no bucket "other" in docs.',
  );
  assert.match((await run('buckets', 'key', 'list', 'assets')).err, /key create/);
  assert.match((await run('buckets', 'keys')).err, /Which bucket\?/);
});
