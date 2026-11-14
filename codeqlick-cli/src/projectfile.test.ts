import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ApiError, formatApiError, formatConfigErrors } from './api.ts';
import { configCheckText } from './cli.ts';
import {
  ProjectFileError,
  hasRules,
  mergeProjectFile,
  parseProjectText,
  writeProjectFile,
} from './config.ts';

test('linking sets team, project and dir and keeps every other key in its place', () => {
  const existing = {
    $schema: 'https://api.codeqlick.com/v1/cloud/schema/codeqlick.json',
    team: 'old',
    cleanUrls: false,
    redirects: [{ source: '/a', destination: '/b' }],
    typo: 1,
  };
  const merged = mergeProjectFile(existing, { team: 'acme', project: 'web', dir: 'dist' });
  assert.deepEqual(Object.keys(merged), [
    '$schema',
    'team',
    'cleanUrls',
    'redirects',
    'typo',
    'project',
    'dir',
  ]);
  assert.equal(merged.team, 'acme');
  assert.deepEqual(merged.redirects, existing.redirects);
});

test('writeProjectFile merges with the file on disk', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'cq-cli-'));
  try {
    await writeProjectFile({ team: 'acme', project: 'web', dir: 'dist' }, cwd);
    assert.deepEqual(JSON.parse(await readFile(join(cwd, 'codeqlick.json'), 'utf8')), {
      team: 'acme',
      project: 'web',
      dir: 'dist',
    });
    await writeFile(
      join(cwd, 'codeqlick.json'),
      '{"headers":[{"source":"/*","headers":{"Cache-Control":"no-store"}}],"dir":"out"}',
    );
    await writeProjectFile({ team: 'acme', project: 'web', dir: 'dist' }, cwd);
    const data = JSON.parse(await readFile(join(cwd, 'codeqlick.json'), 'utf8'));
    assert.equal(data.dir, 'dist');
    assert.equal(data.headers[0].headers['Cache-Control'], 'no-store');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('a codeqlick.json that is not valid JSON is never overwritten', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'cq-cli-'));
  try {
    const broken = '{ "redirects": [ ';
    await writeFile(join(cwd, 'codeqlick.json'), broken);
    await assert.rejects(
      writeProjectFile({ team: 'a', project: 'b', dir: 'c' }, cwd),
      (error: unknown) =>
        error instanceof ProjectFileError && /isn't valid JSON/.test(error.message),
    );
    assert.equal(await readFile(join(cwd, 'codeqlick.json'), 'utf8'), broken);
    await writeFile(join(cwd, 'codeqlick.json'), '[]');
    await assert.rejects(writeProjectFile({ team: 'a' }, cwd), /must be a JSON object/);
    assert.throws(() => parseProjectText('null'), ProjectFileError);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('only a file with routing keys (or one that does not parse) counts as having rules', () => {
  assert.equal(hasRules('{"team":"a","project":"b","dir":"dist"}'), false);
  assert.equal(hasRules('{"cleanUrls":false}'), true);
  assert.equal(hasRules('{"redirects":[]}'), true);
  assert.equal(hasRules('{ nope'), true);
});

test('validation errors print one per line with their path', () => {
  const errors = [
    { path: 'redirects[3].status', message: 'must be 301, 302, 307 or 308' },
    { path: 'headers[0].headers.Set-Cookie', message: 'not an allowed header' },
  ];
  assert.deepEqual(formatConfigErrors(errors), [
    '  redirects[3].status: must be 301, 302, 307 or 308',
    '  headers[0].headers.Set-Cookie: not an allowed header',
  ]);
  const detailed = new ApiError(400, 'codeqlick.json is invalid', errors);
  assert.equal(
    formatApiError(detailed),
    'codeqlick.json is invalid\n  redirects[3].status: must be 301, 302, 307 or 308\n  headers[0].headers.Set-Cookie: not an allowed header',
  );
  const joined = new ApiError(
    400,
    'redirects[3].status: must be 301, 302, 307 or 308',
    errors.slice(0, 1),
  );
  assert.equal(formatApiError(joined), '  redirects[3].status: must be 301, 302, 307 or 308');
  assert.equal(formatApiError(new ApiError(413, 'Too big')), 'Too big');
});

test('config check prints the summary or the problems', () => {
  assert.match(
    configCheckText({
      ok: true,
      summary: { redirects: 1, rewrites: 0, headers: 2, cleanUrls: true, trailingSlash: null },
    }),
    /ok: 1 redirect, 0 rewrites, 2 header rules$/,
  );
  assert.match(
    configCheckText({
      ok: true,
      summary: { redirects: 0, rewrites: 0, headers: 0, cleanUrls: false, trailingSlash: true },
    }),
    /cleanUrls off, trailingSlash true$/,
  );
  assert.equal(
    configCheckText({ ok: false, errors: [{ path: 'redirects', message: '101 rules' }] }),
    'codeqlick.json has 1 problem:\n  redirects: 101 rules',
  );
});
