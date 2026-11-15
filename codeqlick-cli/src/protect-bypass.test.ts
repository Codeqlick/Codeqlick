import assert from 'node:assert/strict';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { main } from './cli.ts';

const TOKEN = 'cqb_' + 'Z'.repeat(43);
const project = { id: 'p-1', slug: 'docs', name: 'Docs', team: { slug: 'acme', name: 'Acme' } };
const calls: string[] = [];
let bypass: Record<string, unknown> | null = null;
let base = '';
const server = createServer((req: IncomingMessage, res) => {
  calls.push(`${req.method} ${req.url}`);
  const send = (status: number, body?: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(body === undefined ? undefined : JSON.stringify(body));
  };
  if (req.url?.endsWith('/cloud/teams/acme/projects')) return send(200, { items: [project] });
  if (req.url?.endsWith('/protection/bypass') && req.method === 'POST') {
    return send(200, {
      token: TOKEN,
      prefix: TOKEN.slice(0, 12),
      createdAt: '2026-11-14T10:00:00Z',
    });
  }
  if (req.url?.endsWith('/protection/bypass') && req.method === 'DELETE') return send(204);
  if (req.url?.endsWith('/protection')) {
    return send(200, {
      mode: 'ALL',
      days: 7,
      hasPassword: true,
      updatedAt: null,
      bypass,
    });
  }
  return send(404, { message: 'not found' });
});

before(async () => {
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.CODEQLICK_API_URL = base;
  process.env.CODEQLICK_TOKEN = 'cqk_test';
});
after(() => {
  server.close();
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

test('protect bypass prints only the token on standard output', async () => {
  const result = await run('protect', 'bypass');
  assert.equal(result.code, 0);
  assert.equal(result.out, TOKEN);
  assert.match(result.err, /X-Codeqlick-Bypass/);
  assert.match(result.err, /shown only now/);
  assert.ok(calls.includes('POST /cloud/projects/p-1/protection/bypass'));
});

test('protect bypass --json prints the API answer', async () => {
  const result = await run('protect', 'bypass', '--json');
  assert.equal(result.code, 0);
  assert.deepEqual(JSON.parse(result.out), {
    token: TOKEN,
    prefix: TOKEN.slice(0, 12),
    createdAt: '2026-11-14T10:00:00Z',
  });
});

test('protect bypass --revoke removes it, quietly on standard output', async () => {
  const result = await run('protect', 'bypass', '--revoke');
  assert.equal(result.code, 0);
  assert.equal(result.out, '');
  assert.match(result.err, /revoked/);
  assert.ok(
    calls.some((call) => call.startsWith('DELETE ') && call.endsWith('/protection/bypass')),
  );
  const json = await run('protect', 'bypass', '--revoke', '--json');
  assert.deepEqual(JSON.parse(json.out), {});
});

test('protect shows whether a bypass token is set', async () => {
  bypass = null;
  assert.match((await run('protect')).out, /bypass\s+none/);
  bypass = {
    prefix: 'cqb_ZZZZZZZZ',
    createdAt: '2026-11-14T10:00:00Z',
    createdBy: null,
    lastUsedAt: null,
  };
  const shown = await run('protect');
  assert.match(shown.out, /bypass\s+cqb_ZZZZZZZZ… \(never used\)/);
  assert.doesNotMatch(shown.out, /cqb_Z{43}/);
  const json = await run('protect', '--json');
  assert.deepEqual(JSON.parse(json.out).bypass, bypass);
});

test('--revoke is only for protect bypass', async () => {
  const result = await run('protect', 'all', '--revoke');
  assert.notEqual(result.code, 0);
  assert.match(result.err, /protect bypass/);
});
