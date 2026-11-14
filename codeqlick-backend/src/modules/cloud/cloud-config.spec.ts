import { describe, expect, it } from 'vitest';
import {
  ALLOWED_HEADERS,
  NONE_PATH,
  PatternError,
  compilePattern,
  configJsonSchema,
  evaluate,
  limitsFor,
  matchPattern,
  needsMarker,
  parseConfig,
  summarize,
  type CloudConfig,
  type ConfigError,
} from './cloud-config.js';

const FREE = limitsFor('FREE');

/** Parses a file that must be valid. */
function valid(file: unknown): CloudConfig | null {
  const result = parseConfig(JSON.stringify(file), FREE, 'FREE');
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.config;
}

/** The errors of a file that must be invalid. */
function invalid(file: unknown, limits = FREE, plan = 'FREE'): ConfigError[] {
  const text = typeof file === 'string' ? file : JSON.stringify(file);
  const result = parseConfig(text, limits, plan);
  if (result.ok) throw new Error('expected errors');
  return result.errors;
}

/** The deployment's files: a set of paths. */
const files =
  (...paths: string[]) =>
  (path: string) =>
    Promise.resolve(paths.includes(path));

describe('patterns', () => {
  const match = (source: string, path: string) => {
    const found = matchPattern(compilePattern(source), path);
    return found ? Object.fromEntries(found) : null;
  };

  it('matches literals exactly, case-sensitively', () => {
    expect(match('/about', '/about')).toEqual({});
    expect(match('/about', '/About')).toBeNull();
    expect(match('/about', '/about/')).toBeNull();
    expect(match('/about/', '/about/')).toEqual({});
    expect(match('/', '/')).toEqual({});
    expect(match('/a/b', '/a/b/c')).toBeNull();
  });

  it('matches :name as one non-empty segment', () => {
    expect(match('/old/:slug', '/old/hello')).toEqual({ slug: 'hello' });
    expect(match('/old/:slug', '/old/')).toBeNull();
    expect(match('/old/:slug', '/old')).toBeNull();
    expect(match('/old/:slug', '/old/a/b')).toBeNull();
    expect(match('/:a/:b', '/x/y')).toEqual({ a: 'x', b: 'y' });
  });

  it('matches * and :name* as the rest of the path, possibly empty', () => {
    expect(match('/docs/*', '/docs/a/b')).toEqual({ splat: 'a/b' });
    expect(match('/docs/*', '/docs')).toEqual({ splat: '' });
    expect(match('/docs/*', '/docs/')).toEqual({ splat: '' });
    expect(match('/docs/*', '/docsx')).toBeNull();
    expect(match('/*', '/')).toEqual({ splat: '' });
    expect(match('/*', '/a')).toEqual({ splat: 'a' });
    expect(match('/blog/:rest*', '/blog/2026/x')).toEqual({ rest: '2026/x' });
    expect(match('/v/:id/*', '/v/7/a/b')).toEqual({ id: '7', splat: 'a/b' });
  });

  it('refuses bad sources with the reason', () => {
    const refused = (source: string) => {
      try {
        compilePattern(source);
      } catch (error) {
        expect(error).toBeInstanceOf(PatternError);
        return (error as Error).message;
      }
      return null;
    };
    expect(refused('about')).toContain('start with /');
    expect(refused('/a//b')).toContain('empty segment');
    expect(refused('/a*b')).toContain('whole segment');
    expect(refused('/*/b')).toContain('last segment');
    expect(refused('/:/x')).toContain('bad parameter name');
    expect(refused('/:1a')).toContain('bad parameter name');
    expect(refused('/:a/:a')).toContain('repeats');
    expect(refused('/:a/:b/:c/:d/:e/:f')).toContain('more than 5');
    expect(refused('/__codeqlick/password')).toContain('own');
    expect(refused('/__codeqlick')).toContain('own');
    expect(refused('/__cq_check')).toContain('own');
    expect(refused('/a\\b')).toContain('backslashes');
    expect(refused('/a?x=1')).toContain('? or #');
    expect(refused('/a#top')).toContain('? or #');
    expect(refused('/ok/:slug')).toBeNull();
    // Only these two prefixes are Cloud's.
    expect(refused('/__codeqlickx')).toBeNull();
  });
});

describe('parsing', () => {
  it('takes a full file and drops the CLI link keys and $schema', () => {
    const config = valid({
      $schema: 'https://api.codeqlick.com/v1/cloud/schema/codeqlick.json',
      team: 'acme',
      project: 'web',
      dir: 'dist',
      cleanUrls: true,
      trailingSlash: false,
      redirects: [{ source: '/old/:slug', destination: '/blog/:slug', status: 301 }],
      rewrites: [{ source: '/app/*', destination: '/app/index.html' }],
      headers: [{ source: '/*', headers: { 'content-security-policy': "default-src 'self'" } }],
    });
    expect(config).toEqual({
      cleanUrls: true,
      trailingSlash: false,
      redirects: [{ source: '/old/:slug', destination: '/blog/:slug', status: 301 }],
      rewrites: [{ source: '/app/*', destination: '/app/index.html' }],
      headers: [{ source: '/*', headers: { 'Content-Security-Policy': "default-src 'self'" } }],
    });
    expect(summarize(config)).toEqual({
      redirects: 1,
      rewrites: 1,
      headers: 1,
      cleanUrls: true,
      trailingSlash: false,
    });
  });

  it('stores nothing for a file with none of the rule keys', () => {
    expect(valid({})).toBeNull();
    expect(valid({ team: 'acme', project: 'web', dir: 'dist' })).toBeNull();
    expect(valid({ redirects: [], rewrites: [], headers: [] })).toBeNull();
    expect(summarize(null)).toBeNull();
  });

  it('accepts a BOM', () => {
    const result = parseConfig('﻿{"cleanUrls":false}', FREE, 'FREE');
    expect(result).toEqual({ ok: true, config: { cleanUrls: false } });
  });

  it('wants a marker only when something changes the answers', () => {
    expect(needsMarker(null)).toBe(false);
    expect(needsMarker(valid({ cleanUrls: true }))).toBe(false);
    expect(needsMarker(valid({ cleanUrls: false }))).toBe(true);
    expect(needsMarker(valid({ trailingSlash: false }))).toBe(true);
    expect(needsMarker(valid({ redirects: [{ source: '/a', destination: '/b' }] }))).toBe(true);
    expect(needsMarker(valid({ rewrites: [{ source: '/a', destination: '/b.html' }] }))).toBe(true);
    expect(needsMarker(valid({ headers: [{ source: '/*', headers: { Link: '<a>' } }] }))).toBe(
      true,
    );
  });

  it('reports invalid JSON with its line', () => {
    expect(invalid('{\n  "redirects": [\n  oops\n}')).toEqual([
      { path: 'codeqlick.json', message: expect.stringMatching(/^invalid JSON( at line \d+)?$/) },
    ]);
    const [error] = invalid('not json');
    expect(error?.path).toBe('codeqlick.json');
    expect(error?.message).toMatch(/^invalid JSON/);
  });

  it('refuses a file that is not an object', () => {
    expect(invalid('[]')[0]?.path).toBe('codeqlick.json');
    expect(invalid('null')[0]?.path).toBe('codeqlick.json');
  });

  it('refuses unknown keys with their path (a typo is an error)', () => {
    expect(invalid({ redirect: [] })).toEqual([{ path: 'redirect', message: 'not a known key' }]);
    expect(invalid({ redirects: [{ source: '/a', destination: '/b', statuss: 301 }] })).toEqual([
      { path: 'redirects[0].statuss', message: 'not a known key' },
    ]);
  });

  it('names the exact path of a wrong status', () => {
    const errors = invalid({
      redirects: [
        { source: '/a', destination: '/b' },
        { source: '/c', destination: '/d' },
        { source: '/e', destination: '/f' },
        { source: '/g', destination: '/h', status: 302 },
        { source: '/i', destination: '/j', status: 404 },
      ],
    });
    expect(errors).toEqual([
      { path: 'redirects[4].status', message: 'must be 301, 302, 307 or 308' },
    ]);
    expect(invalid({ redirects: [{ source: '/a', destination: '/b', status: '301' }] })).toEqual([
      { path: 'redirects[0].status', message: 'must be 301, 302, 307 or 308' },
    ]);
  });

  it('names missing and mistyped fields', () => {
    const [missing] = invalid({ redirects: [{ source: '/a' }] });
    expect(missing?.path).toBe('redirects[0].destination');
    const [typed] = invalid({ cleanUrls: 'yes' });
    expect(typed?.path).toBe('cleanUrls');
    const [value] = invalid({ headers: [{ source: '/*', headers: { Link: 3 } }] });
    expect(value?.path).toBe('headers[0].headers.Link');
  });

  it('checks sources and destinations of redirects', () => {
    const one = (rule: Record<string, unknown>) =>
      invalid({ redirects: [{ source: '/a', destination: '/b', ...rule }] });
    expect(one({ source: 'a' })).toEqual([
      { path: 'redirects[0].source', message: 'must start with /' },
    ]);
    expect(one({ destination: '//evil.test/x' })[0]?.path).toBe('redirects[0].destination');
    expect(one({ destination: 'ftp://x.test/' })[0]?.path).toBe('redirects[0].destination');
    expect(one({ destination: 'javascript:alert(1)' })[0]?.path).toBe('redirects[0].destination');
    expect(one({ destination: '/b\\evil' })[0]?.path).toBe('redirects[0].destination');
    expect(one({ destination: 'https://user:pass@x.test/' })[0]?.message).toContain('credentials');
    expect(one({ source: '/a/:x', destination: 'https://:x.test/' })[0]?.message).toContain('host');
    expect(one({ destination: '/b/:nope' })[0]?.message).toContain(':nope');
    expect(one({ source: '/a', destination: '/a' })[0]?.message).toContain('loop');
    expect(one({ source: '/__codeqlick/x' })[0]?.path).toBe('redirects[0].source');
    expect(one({ source: '/__cq_check' })[0]?.path).toBe('redirects[0].source');
    // Fine ones.
    expect(
      valid({ redirects: [{ source: '/a/:x', destination: 'https://x.test/:x?y=1' }] }),
    ).not.toBeNull();
    expect(
      valid({ redirects: [{ source: '/a', destination: 'http://x.test:8080/b' }] }),
    ).not.toBeNull();
  });

  it('keeps rewrites inside the deployment', () => {
    const one = (destination: string) =>
      invalid({ rewrites: [{ source: '/app/*', destination }] })[0];
    expect(one('https://x.test/')?.path).toBe('rewrites[0].destination');
    expect(one('//x.test/')?.path).toBe('rewrites[0].destination');
    expect(one('index.html')?.path).toBe('rewrites[0].destination');
    expect(one('/index.html?x=1')?.message).toContain('no query');
    expect(one('/a/../b.html')?.message).toContain('..');
    expect(one('/.cq-rules')?.message).toContain('.cq-');
    expect(one('/x/.cq-none')?.message).toContain('.cq-');
    expect(one('/:nope.html')?.message).toContain(':nope');
    expect(
      valid({ rewrites: [{ source: '/app/*', destination: '/app/:splat.html' }] }),
    ).not.toBeNull();
    expect(
      invalid({ rewrites: [{ source: '/app/*', destination: '/app/*' }] })[0]?.message,
    ).toContain('loop');
  });

  it('allows only the listed headers, and says why for the others', () => {
    const one = (name: string, value = 'x') =>
      invalid({ headers: [{ source: '/*', headers: { [name]: value } }] })[0];
    for (const name of ['Strict-Transport-Security', 'x-content-type-options', 'Referrer-Policy']) {
      expect(one(name)).toEqual({
        path: `headers[0].headers.${name}`,
        message: expect.stringContaining('not an allowed header'),
      });
      expect(one(name)?.message).toContain("can't change");
    }
    for (const name of ['Set-Cookie', 'Content-Type', 'Content-Length', 'Location', 'Host']) {
      expect(one(name)?.message).toContain('break the response');
    }
    expect(one('X-Custom')?.message).toContain(`allowed: ${ALLOWED_HEADERS.join(', ')}`);
    expect(one('Link', '')?.message).toContain('empty');
    expect(one('Link', 'a\nb')?.message).toContain('printable ASCII');
    expect(one('Link', 'café')?.message).toContain('printable ASCII');
    expect(one('Link', 'x'.repeat(2049))?.message).toContain('2048');
    for (const name of ALLOWED_HEADERS) {
      expect(
        valid({ headers: [{ source: '/*', headers: { [name.toUpperCase()]: 'v' } }] }),
      ).toEqual({
        headers: [{ source: '/*', headers: { [name]: 'v' } }],
      });
    }
  });

  it('limits the headers of a rule', () => {
    const repeated = invalid({
      headers: [{ source: '/*', headers: { Link: 'a', link: 'b' } }],
    });
    expect(repeated[0]?.message).toContain('repeated');
    const big = Object.fromEntries(
      ALLOWED_HEADERS.slice(0, 9).map((name) => [name, 'x'.repeat(1900)]),
    );
    expect(invalid({ headers: [{ source: '/*', headers: big }] })[0]).toEqual({
      path: 'headers[0].headers',
      message: expect.stringContaining('16384'),
    });
  });

  it('refuses a header rule with a bad source', () => {
    expect(invalid({ headers: [{ source: '/__cq_x', headers: { Link: 'a' } }] })[0]?.path).toBe(
      'headers[0].source',
    );
  });

  it("applies the plan's limits, named in the message", () => {
    const redirects = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        source: `/old/${index}`,
        destination: `/new/${index}`,
      }));
    expect(valid({ redirects: redirects(100) })).not.toBeNull();
    expect(invalid({ redirects: redirects(101) })).toEqual([
      { path: 'redirects', message: '101 rules, the free plan allows 100' },
    ]);
    // Redirects plus rewrites.
    expect(
      invalid({
        redirects: redirects(60),
        rewrites: Array.from({ length: 41 }, (_, index) => ({
          source: `/r/${index}`,
          destination: '/index.html',
        })),
      }),
    ).toEqual([{ path: 'rewrites', message: '101 rules, the free plan allows 100' }]);
    const headerRules = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        source: `/h/${index}`,
        headers: { Link: 'a' },
      }));
    expect(valid({ headers: headerRules(30) })).not.toBeNull();
    expect(invalid({ headers: headerRules(31) })).toEqual([
      { path: 'headers', message: '31 rules, the free plan allows 30' },
    ]);
    // PRO takes more.
    const pro = limitsFor('PRO');
    expect(parseConfig(JSON.stringify({ redirects: redirects(101) }), pro, 'PRO').ok).toBe(true);
    expect(invalid({ redirects: redirects(2001) }, pro, 'PRO')[0]).toEqual({
      path: 'redirects',
      message: expect.stringContaining('at most 2000'),
    });
  });

  it('refuses a file over its plan size before parsing it', () => {
    const big = `{"redirects": [], "pad": "${'x'.repeat(FREE.bytes)}"}`;
    expect(invalid(big)).toEqual([
      { path: 'codeqlick.json', message: expect.stringContaining('the free plan allows 64 KB') },
    ]);
  });

  it('lists up to 20 errors', () => {
    const bad = Array.from({ length: 30 }, () => ({ source: 'nope', destination: '/b' }));
    expect(invalid({ redirects: bad })).toHaveLength(20);
    expect(invalid({ redirects: bad })[19]?.path).toBe('redirects[19].source');
  });
});

describe('JSON Schema', () => {
  it('describes the file, with unknown keys refused', () => {
    const schema = configJsonSchema() as {
      type: string;
      additionalProperties: unknown;
      properties: Record<string, unknown>;
    };
    expect(schema.type).toBe('object');
    expect(schema.additionalProperties).toBe(false);
    for (const key of [
      '$schema',
      'team',
      'project',
      'dir',
      'cleanUrls',
      'trailingSlash',
      'redirects',
      'rewrites',
      'headers',
    ]) {
      expect(schema.properties).toHaveProperty([key]);
    }
  });
});

describe('evaluate: redirects', () => {
  const config = valid({
    redirects: [
      { source: '/old/:slug', destination: '/blog/:slug', status: 301 },
      { source: '/docs/*', destination: '/guide/:splat', status: 302 },
      { source: '/go', destination: 'https://example.test/x?y=1' },
      { source: '/shop/:item', destination: 'https://example.test/p/:item' },
      { source: '/same/*', destination: '/first' },
      { source: '/same/a', destination: '/second' },
      { source: '/index.html', destination: '/' },
      { source: '/frag', destination: '/target#part' },
    ],
  })!;
  const run = (uri: string, args = '', present: string[] = []) =>
    evaluate(config, uri, args, files(...present));

  it('redirects with the rule status, 308 by default, and fills the parameters', async () => {
    expect(await run('/old/hello')).toEqual({
      kind: 'redirect',
      status: 301,
      location: '/blog/hello',
    });
    expect(await run('/docs/a/b')).toEqual({
      kind: 'redirect',
      status: 302,
      location: '/guide/a/b',
    });
    expect(await run('/docs')).toEqual({ kind: 'redirect', status: 302, location: '/guide/' });
    expect(await run('/go')).toEqual({
      kind: 'redirect',
      status: 308,
      location: 'https://example.test/x?y=1',
    });
  });

  it('keeps the query unless the destination has its own', async () => {
    expect(await run('/old/a', 'x=1&y=2')).toMatchObject({ location: '/blog/a?x=1&y=2' });
    expect(await run('/go', 'x=1')).toMatchObject({ location: 'https://example.test/x?y=1' });
    expect(await run('/shop/shoe', 'c=red')).toMatchObject({
      location: 'https://example.test/p/shoe?c=red',
    });
    expect(await run('/frag', 'a=1')).toMatchObject({ location: '/target?a=1#part' });
  });

  it('encodes what goes into the Location', async () => {
    expect(await run('/old/a b')).toMatchObject({ location: '/blog/a%20b' });
    expect(await run('/old/café')).toMatchObject({ location: '/blog/caf%C3%A9' });
    expect(await run('/old/a%b')).toMatchObject({ location: '/blog/a%25b' });
    expect(await run('/docs/x y/z?')).toMatchObject({ location: '/guide/x%20y/z%3F' });
    expect(await run('/old/x', 'q=a b')).toMatchObject({ location: '/blog/x?q=a%20b' });
    expect(await run('/old/x', 'q=%C3%A9')).toMatchObject({ location: '/blog/x?q=%C3%A9' });
  });

  it('never produces a protocol-relative Location', async () => {
    const loose = valid({ redirects: [{ source: '/to/*', destination: '/:splat' }] })!;
    const result = await evaluate(loose, '/to//evil.test/x', '', files());
    expect(result).toMatchObject({ kind: 'redirect' });
    expect((result as { location: string }).location.startsWith('//')).toBe(false);
  });

  it('takes the first match, before any file is looked at', async () => {
    expect(await run('/same/a')).toMatchObject({ location: '/first' });
    expect(await run('/index.html', '', ['/index.html'])).toMatchObject({
      kind: 'redirect',
      location: '/',
    });
    expect(await run('/old/x', '', ['/old/x'])).toMatchObject({ kind: 'redirect' });
  });
});

describe('evaluate: files, clean URLs and fallbacks', () => {
  it('serves the exact file, <path>.html and <path>/index.html, in that order', async () => {
    const config = valid({ cleanUrls: true })!;
    const present = ['/index.html', '/about.html', '/blog/index.html', '/a.html', '/a/index.html'];
    const run = (uri: string) => evaluate(config, uri, '', files(...present));
    expect(await run('/')).toEqual({ kind: 'serve', path: '/index.html', headers: {} });
    expect(await run('/about')).toMatchObject({ path: '/about.html' });
    expect(await run('/about.html')).toMatchObject({ path: '/about.html' });
    expect(await run('/blog/')).toMatchObject({ path: '/blog/index.html' });
    // A folder asked for without its slash goes to it (301, query kept), as Nginx does.
    expect(await run('/blog')).toEqual({ kind: 'redirect', status: 301, location: '/blog/' });
    expect(await evaluate(config, '/blog', 'a=1', files(...present))).toMatchObject({
      location: '/blog/?a=1',
    });
    // <path>.html beats <path>/index.html.
    expect(await run('/a')).toMatchObject({ path: '/a.html' });
  });

  it('with cleanUrls false only exact files and folders answer', async () => {
    const config = valid({ cleanUrls: false })!;
    const present = ['/index.html', '/about.html', '/blog/index.html'];
    const run = (uri: string) => evaluate(config, uri, '', files(...present));
    expect(await run('/about')).toEqual({ kind: 'serve', path: NONE_PATH, headers: {} });
    expect(await run('/about.html')).toMatchObject({ path: '/about.html' });
    expect(await run('/blog')).toMatchObject({ kind: 'redirect', status: 301 });
    expect(await run('/blog/')).toMatchObject({ path: '/blog/index.html' });
    expect(await run('/')).toMatchObject({ path: '/index.html' });
  });

  it('answers /.cq-none when nothing serves the path', async () => {
    const config = valid({ headers: [{ source: '/*', headers: { Link: 'x' } }] })!;
    expect(await evaluate(config, '/missing', '', files('/index.html'))).toEqual({
      kind: 'serve',
      path: NONE_PATH,
      headers: { Link: 'x' },
    });
    expect(await evaluate(config, '/', '', files())).toMatchObject({ path: NONE_PATH });
  });

  it('never serves Cloud-reserved or escaping paths, even when the file exists', async () => {
    const config = valid({
      redirects: [{ source: '/zzz', destination: '/y' }],
      rewrites: [{ source: '/*', destination: '/index.html' }],
    })!;
    const present = ['/.cq-rules', '/index.html', '/a/.cq-x'];
    for (const uri of ['/.cq-rules', '/a/.cq-x', '/.cq-none', '/a/../b', '/a/./b', '/x\ny']) {
      expect(await evaluate(config, uri, '', files(...present))).toEqual({
        kind: 'serve',
        path: NONE_PATH,
        headers: {},
      });
    }
    // Redirect rules don't see those paths either.
    const catchAll = valid({ redirects: [{ source: '/*', destination: '/home' }] })!;
    expect(await evaluate(catchAll, '/.cq-rules', '', files())).toMatchObject({ kind: 'serve' });
  });
});

describe('evaluate: rewrites', () => {
  const config = valid({
    rewrites: [
      { source: '/app/*', destination: '/app/index.html' },
      { source: '/u/:name', destination: '/users/:name.html' },
      { source: '/*', destination: '/200.html' },
    ],
  })!;
  const present = [
    '/index.html',
    '/app/index.html',
    '/users/ada.html',
    '/200.html',
    '/app/real.js',
  ];
  const run = (uri: string) => evaluate(config, uri, '', files(...present));

  it('rewrites only when no file matched: a file always wins', async () => {
    expect(await run('/app/real.js')).toMatchObject({ path: '/app/real.js' });
    expect(await run('/app/dashboard/x')).toMatchObject({ path: '/app/index.html' });
    expect(await run('/app')).toMatchObject({ kind: 'redirect', location: '/app/' });
    expect(await run('/app/')).toMatchObject({ path: '/app/index.html' });
    expect(await run('/')).toMatchObject({ path: '/index.html' });
  });

  it('sends a file, never a folder: a folder target resolves to its index or answers nothing', async () => {
    const folder = valid({
      rewrites: [
        { source: '/a/*', destination: '/app' },
        { source: '/b/*', destination: '/app/' },
        { source: '/c/*', destination: '/page' },
        { source: '/d/*', destination: '/empty' },
      ],
    })!;
    const present = ['/app/index.html', '/page.html'];
    const run = (uri: string, config = folder) => evaluate(config, uri, '', files(...present));
    expect(await run('/a/x')).toMatchObject({ path: '/app/index.html' });
    expect(await run('/b/x')).toMatchObject({ path: '/app/index.html' });
    expect(await run('/c/x')).toMatchObject({ path: '/page.html' });
    expect(await run('/d/x')).toMatchObject({ path: NONE_PATH });
    const strict = valid({
      cleanUrls: false,
      rewrites: [{ source: '/c/*', destination: '/page' }],
    })!;
    expect(await run('/c/x', strict)).toMatchObject({ path: NONE_PATH });
  });

  it('takes the first matching rewrite and substitutes parameters', async () => {
    expect(await run('/u/ada')).toMatchObject({ path: '/users/ada.html' });
    expect(await run('/elsewhere')).toMatchObject({ path: '/200.html' });
  });

  it('refuses a rewrite that a parameter turns into a reserved or escaping path', async () => {
    const loose = valid({ rewrites: [{ source: '/v/*', destination: '/pages/:splat' }] })!;
    for (const uri of ['/v/../secret', '/v/.cq-rules', '/v/a/.cq-x']) {
      expect(await evaluate(loose, uri, '', files())).toMatchObject({ path: NONE_PATH });
    }
    expect(await evaluate(loose, '/v/a//b', '', files('/pages/a/b'))).toMatchObject({
      path: '/pages/a/b',
    });
  });
});

describe('evaluate: headers', () => {
  const config = valid({
    headers: [
      {
        source: '/*',
        headers: { 'Content-Security-Policy': "default-src 'self'", 'X-Robots-Tag': 'a' },
      },
      { source: '/docs/*', headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'b' } },
      { source: '/private', headers: { 'x-frame-options': 'DENY' } },
      { source: '/other', headers: { Link: '</a>; rel=preload' } },
    ],
  })!;
  const present = ['/index.html', '/docs/a.html', '/private.html', '/other.html'];
  const run = (uri: string) => evaluate(config, uri, '', files(...present));

  it('adds every matching rule in file order, a later rule replacing the same name', async () => {
    expect(await run('/')).toEqual({
      kind: 'serve',
      path: '/index.html',
      headers: { 'Content-Security-Policy': "default-src 'self'", 'X-Robots-Tag': 'a' },
    });
    expect(await run('/docs/a')).toEqual({
      kind: 'serve',
      path: '/docs/a.html',
      headers: {
        'Content-Security-Policy': "default-src 'self'",
        'X-Robots-Tag': 'b',
        'Cache-Control': 'no-store',
      },
    });
    expect(await run('/private')).toMatchObject({
      headers: { 'Content-Security-Policy': "default-src 'self'", 'X-Frame-Options': 'DENY' },
    });
    expect((await run('/other')) as { headers: Record<string, string> }).toMatchObject({
      headers: { Link: '</a>; rel=preload' },
    });
  });

  it('adds headers to rewritten and unmatched responses too, but not to redirects', async () => {
    expect(await run('/nothing-here')).toMatchObject({
      path: NONE_PATH,
      headers: { 'X-Robots-Tag': 'a' },
    });
    const withRedirect = valid({
      redirects: [{ source: '/a', destination: '/b' }],
      headers: [{ source: '/*', headers: { Link: 'x' } }],
    })!;
    expect(await evaluate(withRedirect, '/a', '', files())).toEqual({
      kind: 'redirect',
      status: 308,
      location: '/b',
    });
  });
});

describe('evaluate: trailingSlash', () => {
  const present = [
    '/index.html',
    '/about.html',
    '/docs/index.html',
    '/blog/post.html',
    '/style.css',
    '/LICENSE',
  ];

  it('true: a path without an extension gets a 308 to the same path with a slash', async () => {
    const config = valid({ trailingSlash: true })!;
    const run = (uri: string, args = '') => evaluate(config, uri, args, files(...present));
    expect(await run('/about')).toEqual({ kind: 'redirect', status: 308, location: '/about/' });
    expect(await run('/docs')).toEqual({ kind: 'redirect', status: 308, location: '/docs/' });
    expect(await run('/docs', 'a=1&b=2')).toMatchObject({ location: '/docs/?a=1&b=2' });
    // The slash form answers, with the flat file too.
    expect(await run('/docs/')).toMatchObject({ kind: 'serve', path: '/docs/index.html' });
    expect(await run('/about/')).toMatchObject({ kind: 'serve', path: '/about.html' });
    // Never applied to the root, to extensions, to real extensionless files or to unanswered paths.
    expect(await run('/')).toMatchObject({ kind: 'serve', path: '/index.html' });
    expect(await run('/style.css')).toMatchObject({ kind: 'serve', path: '/style.css' });
    expect(await run('/about.html')).toMatchObject({ kind: 'serve', path: '/about.html' });
    expect(await run('/LICENSE')).toMatchObject({ kind: 'serve', path: '/LICENSE' });
    expect(await run('/missing')).toMatchObject({ kind: 'serve', path: NONE_PATH });
    expect(await run('/missing/')).toMatchObject({ kind: 'serve', path: NONE_PATH });
  });

  it('true: redirects also the paths a rewrite answers', async () => {
    const config = valid({
      trailingSlash: true,
      rewrites: [{ source: '/app/*', destination: '/index.html' }],
    })!;
    expect(await evaluate(config, '/app/x', '', files('/index.html'))).toMatchObject({
      kind: 'redirect',
      location: '/app/x/',
    });
    expect(await evaluate(config, '/app/x/', '', files('/index.html'))).toMatchObject({
      kind: 'serve',
      path: '/index.html',
    });
  });

  it('false: a path with a slash gets a 308 to the same path without it', async () => {
    const config = valid({ trailingSlash: false })!;
    const run = (uri: string, args = '') => evaluate(config, uri, args, files(...present));
    expect(await run('/docs/')).toEqual({ kind: 'redirect', status: 308, location: '/docs' });
    expect(await run('/docs/', 'x=1')).toMatchObject({ location: '/docs?x=1' });
    expect(await run('/docs')).toMatchObject({ kind: 'serve', path: '/docs/index.html' });
    expect(await run('/about')).toMatchObject({ kind: 'serve', path: '/about.html' });
    // `/about/` isn't answered with false (no about/index.html), so it isn't redirected.
    expect(await run('/about/')).toMatchObject({ kind: 'serve', path: NONE_PATH });
    expect(await run('/')).toMatchObject({ kind: 'serve', path: '/index.html' });
    expect(await run('/missing/')).toMatchObject({ kind: 'serve', path: NONE_PATH });
    expect(await run('/blog/post.html')).toMatchObject({ kind: 'serve' });
  });

  it('unset: both forms answer as without rules (a folder without its slash gets a 301)', async () => {
    const config = valid({ cleanUrls: false })!;
    const run = (uri: string) => evaluate(config, uri, '', files(...present));
    expect(await run('/docs')).toEqual({ kind: 'redirect', status: 301, location: '/docs/' });
    expect(await run('/docs/')).toMatchObject({ kind: 'serve', path: '/docs/index.html' });
  });

  it('redirects rules run before the trailing slash', async () => {
    const config = valid({
      trailingSlash: true,
      redirects: [{ source: '/docs', destination: '/guide' }],
    })!;
    expect(await evaluate(config, '/docs', '', files('/docs/index.html'))).toMatchObject({
      location: '/guide',
    });
  });
});
