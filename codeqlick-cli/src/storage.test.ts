import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { CloudBucket, CloudBucketKey, CloudDatabase } from './api.ts';
import {
  bucketTable,
  columns,
  confirm,
  confirmMode,
  corsLines,
  databaseTable,
  executableNames,
  findByRef,
  findExecutable,
  isYes,
  keyTable,
  parseCors,
  pickByRef,
  pickKey,
  psqlInvocation,
  sizeText,
  splitList,
  withoutPassword,
} from './storage.ts';

const database: CloudDatabase = {
  id: 'd1',
  name: 'main',
  host: 'pg.codeqlick.app',
  port: 5432,
  database: 'cq_0123456789abcdef',
  user: 'cq_0123456789abcdef',
  sizeBytes: 8 * 1024 * 1024,
  maxBytes: 256 * 1024 * 1024,
  readOnly: false,
  connectionUrl:
    'postgresql://cq_0123456789abcdef@pg.codeqlick.app:5432/cq_0123456789abcdef?sslmode=require',
  createdAt: '2026-11-15T10:00:00Z',
};

const key: CloudBucketKey = {
  id: 'k1',
  name: 'site',
  accessKeyId: 'GK0123',
  write: false,
  createdAt: '2026-11-15T10:00:00Z',
};

const bucket: CloudBucket = {
  id: 'b1',
  name: 'assets',
  endpoint: 'https://s3.codeqlick.app',
  region: 'garage',
  sizeBytes: 1536,
  objects: 3,
  maxBytes: 1024 ** 3,
  maxObjects: 100_000,
  public: true,
  publicUrl: 'https://s3.codeqlick.app/_public/assets/',
  cors: {
    origins: ['https://example.com', 'http://localhost:3000'],
    methods: ['GET', 'HEAD'],
    headers: ['*'],
    exposeHeaders: ['ETag'],
    maxAge: 3600,
  },
  keys: [key],
  createdAt: '2026-11-15T10:00:00Z',
};

test('a name is matched as an id first, then exactly (case-sensitive) as a name', () => {
  const list = [
    { ...database, id: 'a', name: 'b' },
    { ...database, id: 'b', name: 'x' },
    { ...database, id: 'c', name: 'Main' },
    { ...database, id: 'd', name: 'Main' },
  ];
  assert.deepEqual(
    findByRef(list, 'b').map((d) => d.id),
    ['b'],
  );
  assert.deepEqual(
    findByRef(list, 'Main').map((d) => d.id),
    ['c', 'd'],
  );
  assert.deepEqual(findByRef(list, 'main'), []);
});

test('no match or several matches is an error that says so', () => {
  const list = [database, { ...database, id: 'd2', createdAt: '2026-11-16T10:00:00Z' }];
  assert.equal(pickByRef(list, 'd2', 'database', 'docs').id, 'd2');
  assert.throws(() => pickByRef(list, 'nope', 'database', 'docs'), {
    message: 'There is no database "nope" in docs.',
  });
  assert.throws(() => pickByRef([bucket], 'nope', 'bucket', 'docs'), {
    message: 'There is no bucket "nope" in docs.',
  });
  assert.throws(() => pickByRef(list, 'main', 'database', 'docs'), {
    message:
      '2 databases are named "main": use an id.\n  d1  created 2026-11-15\n  d2  created 2026-11-16',
  });
});

test('a key is named by its id, its access key id or its name', () => {
  const keys = [key, { ...key, id: 'k2', accessKeyId: 'GK9', name: 'ci' }];
  assert.equal(pickKey(keys, 'k2', 'assets').id, 'k2');
  assert.equal(pickKey(keys, 'GK0123', 'assets').id, 'k1');
  assert.equal(pickKey(keys, 'ci', 'assets').id, 'k2');
  assert.throws(() => pickKey(keys, 'x', 'assets'), {
    message: 'There is no key "x" in the bucket assets.',
  });
  assert.throws(() => pickKey([...keys, { ...key, id: 'k3', accessKeyId: 'GK3' }], 'site', 'b'), {
    message:
      /^2 keys of b are named "site": use an id or access key id\.\n {2}k1 {2}GK0123\n {2}k3 {2}GK3$/,
  });
});

test('--yes skips the question, a terminal asks, no terminal refuses', () => {
  assert.equal(confirmMode({ yes: true, interactive: false }), 'skip');
  assert.equal(confirmMode({ yes: true, interactive: true }), 'skip');
  assert.equal(confirmMode({ yes: undefined, interactive: true }), 'ask');
  assert.equal(confirmMode({ yes: false, interactive: false }), 'refuse');
  assert.equal(confirmMode({ yes: undefined, interactive: undefined }), 'refuse');
});

test('only y or yes goes on', () => {
  for (const answer of ['y', 'Y', 'yes', 'YES', ' yes ']) assert.equal(isYes(answer), true);
  for (const answer of ['', 'n', 'no', 'yeah', 'si', 'y y']) assert.equal(isYes(answer), false);
});

test('confirm asks with [y/N] on a terminal and refuses without one', async () => {
  const asked: string[] = [];
  const io = (answer: string, interactive = true) => ({
    interactive,
    ask: async (prompt: string) => (asked.push(prompt), answer),
  });
  await confirm('Delete it?', undefined, io('y'));
  assert.deepEqual(asked, ['Delete it? [y/N] ']);
  await assert.rejects(confirm('Delete it?', undefined, io('n')), {
    message: 'Cancelled: nothing was changed.',
  });
  await assert.rejects(confirm('Delete it?', undefined, io('y', false)), {
    message: 'Delete it?\nPass --yes to confirm.',
  });
  asked.length = 0;
  await confirm('Delete it?', true, io('n', false));
  assert.deepEqual(asked, []);
});

test('cors set takes origins (also comma-separated) and only the flags given', () => {
  assert.deepEqual(parseCors(['https://a.com', 'https://b.com,http://localhost:3000'], {}), {
    origins: ['https://a.com', 'https://b.com', 'http://localhost:3000'],
  });
  assert.deepEqual(
    parseCors(['*'], { methods: 'get, head,PUT,get', headers: 'content-type,x-a', 'max-age': '0' }),
    {
      origins: ['*'],
      methods: ['GET', 'HEAD', 'PUT'],
      headers: ['content-type', 'x-a'],
      maxAge: 0,
    },
  );
  assert.throws(() => parseCors([], {}), /Which origins/);
  assert.throws(() => parseCors([' , '], {}), /Which origins/);
  assert.throws(
    () =>
      parseCors(
        Array.from({ length: 11 }, (_, i) => `https://${i}.com`),
        {},
      ),
    {
      message: 'A CORS rule has at most 10 origins.',
    },
  );
  assert.throws(() => parseCors(['*'], { methods: 'GET,PATCH' }), /--methods takes GET, HEAD/);
  assert.throws(() => parseCors(['*'], { methods: '' }), /--methods/);
  assert.throws(() => parseCors(['*'], { headers: ',' }), /--headers/);
  for (const age of ['-1', '1.5', 'abc', '86401', ''])
    assert.throws(() => parseCors(['*'], { 'max-age': age }), /--max-age/);
  assert.equal(parseCors(['*'], { 'max-age': '86400' }).maxAge, 86_400);
  assert.deepEqual(splitList(' a, ,b '), ['a', 'b']);
});

test('sizes, columns and tables', () => {
  assert.equal(sizeText(512), '512 B');
  assert.equal(sizeText(1536), '1.5 KB');
  assert.equal(sizeText(256 * 1024 * 1024), '256.0 MB');
  assert.equal(sizeText(10 * 1024 ** 3), '10.0 GB');
  assert.deepEqual(
    columns([
      ['A', 'BB', 'C'],
      ['aaa', 'b', 'last'],
    ]),
    ['A    BB  C', 'aaa  b   last'],
  );
  const dbLines = databaseTable([database, { ...database, name: 'old', readOnly: true }]);
  assert.match(dbLines[0]!, /^NAME\s+SIZE\s+READ-ONLY\s+CONNECTION$/);
  assert.match(dbLines[1]!, /^main\s+8\.0 MB \/ 256\.0 MB\s+no\s+postgresql:\/\/cq_/);
  assert.match(dbLines[2]!, /^old\s+.+\s+yes\s+/);
  const bucketLines = bucketTable([
    bucket,
    { ...bucket, name: 'private', public: false, publicUrl: null, cors: null, keys: [] },
  ]);
  assert.match(bucketLines[0]!, /^NAME\s+SIZE\s+OBJECTS\s+KEYS\s+CORS\s+PUBLIC$/);
  assert.match(
    bucketLines[1]!,
    /^assets\s+1\.5 KB \/ 1\.0 GB\s+3 \/ 100,000\s+1\s+https:\/\/example\.com,http:\/\/localhost:3000\s+public https:\/\/s3\.codeqlick\.app\/_public\/assets\/$/,
  );
  assert.match(bucketLines[2]!, /^private\s+.+\s+0\s+-\s+no$/);
  const keyLines = keyTable([key, { ...key, name: 'ci', write: true }]);
  assert.match(keyLines[1]!, /^site\s+GK0123\s+read-only\s+2026-11-15$/);
  assert.match(keyLines[2]!, /^ci\s+GK0123\s+read-write\s+2026-11-15$/);
  assert.deepEqual(corsLines(null), ['No CORS rule.']);
  assert.match(corsLines(bucket.cors).join('\n'), /origins\s+https:\/\/example\.com, http/);
});

test('a connection URL loses its password', () => {
  assert.equal(
    withoutPassword('postgresql://u:s3cr%2Ft@pg.example.com:5432/db?sslmode=require'),
    'postgresql://u@pg.example.com:5432/db?sslmode=require',
  );
  assert.equal(withoutPassword(database.connectionUrl), database.connectionUrl);
  assert.equal(withoutPassword('not a url'), 'not a url');
});

test('psql gets the URL without the password; the password only in PGPASSWORD', () => {
  const full = 'postgresql://cq_x:Sup3rS3cret@pg.codeqlick.app:5432/cq_x?sslmode=require';
  const call = psqlInvocation('/usr/bin/psql', full, 'Sup3rS3cret', { PATH: '/usr/bin' });
  assert.equal(call.command, '/usr/bin/psql');
  assert.deepEqual(call.args, ['postgresql://cq_x@pg.codeqlick.app:5432/cq_x?sslmode=require']);
  assert.ok(!call.args.join(' ').includes('Sup3rS3cret'));
  assert.equal(call.env.PGPASSWORD, 'Sup3rS3cret');
  assert.equal(call.env.PATH, '/usr/bin');
  const plain = psqlInvocation('psql', database.connectionUrl, undefined, { PGPASSWORD: 'kept' });
  assert.deepEqual(plain.args, [database.connectionUrl]);
  assert.equal(plain.env.PGPASSWORD, 'kept');
  assert.equal(psqlInvocation('psql', full, undefined, {}).env.PGPASSWORD, undefined);
});

test('psql is looked for in PATH (with Windows extensions)', async () => {
  assert.deepEqual(executableNames('psql', 'linux', {}), ['psql']);
  assert.deepEqual(executableNames('psql', 'win32', { PATHEXT: '.EXE;.CMD' }), [
    'psql.exe',
    'psql.cmd',
    'psql',
  ]);
  const dir = await mkdtemp(join(tmpdir(), 'cq-path-'));
  try {
    const empty = await mkdtemp(join(tmpdir(), 'cq-path-'));
    await writeFile(join(dir, 'psql'), '#!/bin/sh\n');
    assert.equal(await findExecutable('psql', { PATH: `${empty}:${dir}` }, 'linux'), null);
    await chmod(join(dir, 'psql'), 0o755);
    assert.equal(
      await findExecutable('psql', { PATH: `${empty}:${dir}` }, 'linux'),
      join(dir, 'psql'),
    );
    assert.equal(await findExecutable('psql', { PATH: empty }, 'linux'), null);
    assert.equal(await findExecutable('psql', {}, 'linux'), null);
    await writeFile(join(dir, 'tool.exe'), '');
    assert.equal(
      await findExecutable('tool', { Path: `${empty};${dir}`, PATHEXT: '.EXE' }, 'win32'),
      join(dir, 'tool.exe'),
    );
    await rm(empty, { recursive: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
