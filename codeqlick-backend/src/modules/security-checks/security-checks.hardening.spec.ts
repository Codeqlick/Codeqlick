import { createSocket } from 'node:dgram';
import { once } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePublicAddress } from '../../common/safe-fetch.js';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { SecurityCheck } from '../../generated/prisma/client.js';
import type { LeadsService } from '../leads/leads.service.js';
import type { MailService } from '../mail/mail.service.js';
import { registrableDomain, tagsOf, webChecks } from './checks-web.js';
import { encodeQuery, parseResponse, rawQuery } from './dns-lookup.js';
import {
  findVulnerableLibraries,
  MAX_SCRIPTS,
  parseRetire,
  pattern,
  type RetireRepository,
} from './retire.js';
import { greetingName } from './security-check-emails.js';
import type { SecurityInputs } from './security-check-inputs.js';
import { DAILY_GLOBAL_LIMIT, MAX_QUEUE, SecurityChecksService } from './security-checks.service.js';
import type { SecurityChecksRepository } from './security-checks.repository.js';

/** Runs `work` and returns how long it took in ms. */
function timed(work: () => unknown): number {
  const started = performance.now();
  work();
  return performance.now() - started;
}

const LIMIT_MS = 200;

describe('hostile pages are read in bounded time', () => {
  it('3 MB of unclosed <script openings', () => {
    const html = '<script '.repeat(400_000);
    const ms = timed(() => tagsOf(html, 'script'));
    expect(ms).toBeLessThan(LIMIT_MS);
  });

  it('3 MB of openings with closing brackets, quotes and long attributes', () => {
    const html = `<script src="${'a'.repeat(100_000)}" ${'x='.repeat(1_000)}>`.repeat(60);
    const ms = timed(() => tagsOf(html, 'script'));
    expect(ms).toBeLessThan(LIMIT_MS);
    const unterminated = `<img src="${'"'.repeat(1_000_000)}`;
    expect(timed(() => tagsOf(unterminated, 'img'))).toBeLessThan(LIMIT_MS);
  });

  it('all the page checks on a 3 MB hostile body', () => {
    const body = '<script <link <img <form <input <iframe <meta '.repeat(70_000);
    const input = withBody(body);
    const ms = timed(() => webChecks(input));
    expect(ms).toBeLessThan(LIMIT_MS * 2);
  });

  it('reads tags and attributes correctly', () => {
    expect(
      tagsOf('<SCRIPT src=a.js async><scripts src=no><script\nsrc="b.js"/>', 'script'),
    ).toEqual([{ src: 'a.js', async: '' }, { src: 'b.js' }]);
    expect(tagsOf('<meta name=\'generator\' content="WP 6.1">', 'meta')).toEqual([
      { name: 'generator', content: 'WP 6.1' },
    ]);
  });

  it('a 40 000 character file name and many scripts', () => {
    const repository: RetireRepository = parseRetire({
      jquery: {
        vulnerabilities: [{ below: '3.5.0', severity: 'medium' }],
        extractors: {
          filename: ['jquery-(§§version§§)(\\.min)?\\.js'],
          uri: ['/(§§version§§)/jquery(\\.min)?\\.js'],
        },
      },
    });
    const long = `https://x.test/${'a'.repeat(40_000)}-1.0.js`;
    expect(timed(() => findVulnerableLibraries([long], repository))).toBeLessThan(LIMIT_MS);
    const many = Array.from({ length: 5_000 }, (_, index) => `https://x.test/j${index}-1.0.js`);
    const ms = timed(() => findVulnerableLibraries(many, repository));
    expect(ms).toBeLessThan(LIMIT_MS);
    expect(MAX_SCRIPTS).toBeLessThanOrEqual(50);
  });

  it('a pattern with nested quantifiers never runs, many patterns stay fast', () => {
    expect(pattern('(a+)+$')).toBeNull();
    expect(pattern('(.*)*x')).toBeNull();
    for (const risky of [
      '(a|aa)+',
      '((a+))+',
      '(\\d|\\d\\d)+$',
      '(?:a|a)*',
      '(a?a?)+',
      '(\\w+\\s?)+',
      '(a{1,5}){1,5}',
    ]) {
      expect(pattern(risky)).toBeNull();
    }
    expect(pattern('jquery(\\.min)?\\.js')).toBeInstanceOf(RegExp);
    expect(pattern('(a)\\1')).toBeNull();
    expect(pattern('a'.repeat(300))).toBeNull();
    expect(pattern('jquery-(§§version§§)\\.js')).toBeInstanceOf(RegExp);
    const repository: RetireRepository = {};
    for (let index = 0; index < 400; index += 1) {
      repository[`lib${index}`] = {
        vulnerabilities: [{ below: '9', severity: 'high' }],
        filename: ['lib-(§§version§§)(.*)(.*)x'],
        uri: ['/(§§version§§)/(.*)lib(.*)\\.js'],
      };
    }
    const urls = Array.from(
      { length: 100 },
      (_, index) => `https://x.test/${'1.'.repeat(200)}/${index}.js`,
    );
    const ms = timed(() => findVulnerableLibraries(urls, repository));
    expect(ms).toBeLessThan(600);
  });
});

function withBody(body: string): SecurityInputs {
  return {
    domain: 'x.test',
    now: new Date(),
    retire: null,
    web: {
      page: { url: 'https://x.test/', status: 200, headers: {}, body },
      certificateFailed: false,
      http: null,
      tls: null,
      securityTxt: null,
    },
    dns: {
      mx: null,
      txt: null,
      spf: { records: [], lookups: 0, redirectRecord: null },
      dmarc: null,
      dkim: [],
      caa: null,
      mtaSts: { txt: [], policy: null },
      tlsRpt: null,
      dnssec: { ad: null, hasDs: null },
    },
  };
}

describe('TLS tie-breaker', () => {
  it('a failed default handshake does not fail the certificate when the page loaded fine', () => {
    const input = withBody('<html></html>');
    input.web.tls = {
      version: null,
      cipher: null,
      authorized: false,
      authError: 'handshake-failed',
      validTo: null,
      tls10: true,
      tls11: false,
    };
    const checks = webChecks(input);
    expect(checks.find((check) => check.id === 'cert-valid')?.status).toBe('pass');
    expect(checks.find((check) => check.id === 'cert-expiry')?.status).toBe('info');
    input.web.certificateFailed = true;
    expect(webChecks(input).find((check) => check.id === 'cert-valid')?.status).toBe('fail');
  });

  it('registrableDomain is a heuristic: two-letter TLDs with a known second level only', () => {
    expect(registrableDomain('www.shop.example.co.uk')).toBe('example.co.uk');
    expect(registrableDomain('a.b.example.com')).toBe('example.com');
    // Known limitation: not the public suffix list.
    expect(registrableDomain('x.example.pvt.k12.ma.us')).toBe('ma.us');
  });
});

describe('resolvePublicAddress (fake lookup)', () => {
  const fake =
    (addresses: Array<{ address: string; family: number }>) =>
    (_host: string, _options: unknown, callback: (...args: unknown[]) => void) =>
      callback(null, addresses);

  it('returns the first address when all are public', async () => {
    const lookup = fake([
      { address: '93.184.216.34', family: 4 },
      { address: '2606:2800:220:1::1', family: 6 },
    ]);
    await expect(resolvePublicAddress('a.test', lookup as never)).resolves.toBe('93.184.216.34');
  });

  it('rejects a private answer and a mixed one', async () => {
    await expect(
      resolvePublicAddress('a.test', fake([{ address: '10.0.0.5', family: 4 }]) as never),
    ).rejects.toThrow(/private/);
    await expect(
      resolvePublicAddress(
        'a.test',
        fake([
          { address: '93.184.216.34', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ]) as never,
      ),
    ).rejects.toThrow(/private/);
    await expect(resolvePublicAddress('a.test', fake([]) as never)).rejects.toThrow(/private/);
  });

  it('passes a resolver error on', async () => {
    const failing = (_host: string, _options: unknown, callback: (...args: unknown[]) => void) =>
      callback(Object.assign(new Error('nope'), { code: 'ENOTFOUND' }));
    await expect(resolvePublicAddress('a.test', failing as never)).rejects.toThrow('nope');
  });
});

describe('raw DNS query', () => {
  const query = encodeQuery(0x1234, 'example.com', 43);

  /** A response to `query` with the given answer record types. */
  function response(types: number[], overrides: { id?: number; qr?: boolean } = {}): Buffer {
    const questionEnd =
      12 + 'example.com'.split('.').length + 'example'.length + 'com'.length + 1 + 4;
    const header = Buffer.alloc(12);
    header.writeUInt16BE(overrides.id ?? 0x1234, 0);
    header.writeUInt16BE((overrides.qr === false ? 0 : 0x8000) | 0x0020, 2);
    header.writeUInt16BE(1, 4);
    header.writeUInt16BE(types.length, 6);
    const answers = types.map((type) => {
      const record = Buffer.alloc(12 + 2);
      record.writeUInt16BE(0xc00c, 0); // pointer to the question name
      record.writeUInt16BE(type, 2);
      record.writeUInt16BE(1, 4);
      record.writeUInt16BE(2, 10); // two bytes of data
      return record;
    });
    return Buffer.concat([header, query.subarray(12, questionEnd), ...answers]);
  }

  it('encodes one question with EDNS0', () => {
    expect(query.readUInt16BE(0)).toBe(0x1234);
    expect(query.readUInt16BE(4)).toBe(1);
    expect(query.readUInt16BE(10)).toBe(1);
  });

  it('reads the AD flag and the types of the answers', () => {
    expect(parseResponse(response([43]), query)).toEqual({ rcode: 0, ad: true, answerTypes: [43] });
    // A CNAME or RRSIG alone is not a DS record.
    expect(parseResponse(response([5, 46]), query)?.answerTypes).toEqual([5, 46]);
  });

  it('refuses short, wrong-id, non-response and other-question replies', () => {
    expect(parseResponse(Buffer.alloc(5), query)).toBeNull();
    expect(parseResponse(response([43], { id: 0x9999 }), query)).toBeNull();
    expect(parseResponse(response([43], { qr: false }), query)).toBeNull();
    const other = response([43]);
    other.write('x', 13); // another name in the question
    expect(parseResponse(other, query)).toBeNull();
    const truncated = response([43]).subarray(0, 30);
    expect(parseResponse(truncated, query)).toBeNull();
  });

  it('ignores replies with the wrong id or from another port, and times out', async () => {
    const server = createSocket('udp4');
    server.bind(0, '127.0.0.1');
    await once(server, 'listening');
    const port = server.address().port;
    server.on('message', (message, remote) => {
      // Short, then an answer for another id: both must be ignored.
      server.send(Buffer.alloc(4), remote.port, remote.address);
      const wrong = Buffer.from(message);
      wrong.writeUInt16BE((message.readUInt16BE(0) + 1) & 0xffff, 0);
      wrong[2] = 0x81;
      server.send(wrong, remote.port, remote.address);
    });
    try {
      await expect(
        rawQuery('127.0.0.1', 'example.com', 1, { port, timeoutMs: 300 }),
      ).rejects.toThrow('DNS timeout');
      // Right server address, but the reply comes from another port than the one asked.
      await expect(
        rawQuery('127.0.0.1', 'example.com', 1, { port: port + 1, timeoutMs: 200 }),
      ).rejects.toThrow('DNS timeout');
    } finally {
      server.close();
    }
  });

  it('accepts the right reply and stops on abort', async () => {
    const server = createSocket('udp4');
    server.bind(0, '127.0.0.1');
    await once(server, 'listening');
    const port = server.address().port;
    server.on('message', (message, remote) => {
      const reply = Buffer.from(message.subarray(0, 12 + 13 + 4));
      reply[2] = 0x81;
      reply[3] = 0x20;
      reply.writeUInt16BE(0, 6);
      server.send(reply, remote.port, remote.address);
    });
    try {
      await expect(rawQuery('127.0.0.1', 'example.com', 1, { port })).resolves.toMatchObject({
        rcode: 0,
        ad: true,
        answerTypes: [],
      });
      const controller = new AbortController();
      controller.abort();
      await expect(
        rawQuery('127.0.0.1', 'example.com', 1, { port, signal: controller.signal }),
      ).rejects.toThrow('Aborted');
    } finally {
      server.close();
    }
  });
});

describe('visitor name in the greeting', () => {
  it('keeps letters and spaces, at most 40 characters', () => {
    expect(greetingName('Lucía  Pérez')).toBe('Lucía Pérez');
    expect(greetingName('Click here: http://evil.example/?a=1 <b>')).toBe(
      'Click here http evil example a b',
    );
    expect(greetingName('x'.repeat(100))).toHaveLength(40);
    expect(greetingName(null)).toBe('');
  });
});

describe('service limits and recovery', () => {
  let repository: Record<string, ReturnType<typeof vi.fn>>;
  let mail: { send: ReturnType<typeof vi.fn> };
  let service: SecurityChecksService;
  const row = (overrides: Partial<SecurityCheck> = {}): SecurityCheck => ({
    id: 'a0000000-0000-4000-8000-000000000001',
    domain: 'lucia.com',
    name: null,
    email: 'lucia@example.com',
    locale: 'EN',
    status: 'PENDING',
    score: null,
    grade: null,
    result: null,
    error: null,
    leadId: null,
    finishedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
  const create = {
    domain: 'shop.lucia.com',
    email: 'lucia@example.com',
    name: undefined,
    locale: 'en' as const,
    acceptPrivacy: true as const,
  };

  beforeEach(() => {
    repository = {
      create: vi.fn().mockResolvedValue(row()),
      find: vi.fn().mockResolvedValue(row()),
      findRecent: vi.fn().mockResolvedValue(null),
      countByEmailSince: vi.fn().mockResolvedValue(0),
      countByDomainSince: vi.fn().mockResolvedValue(0),
      countSince: vi.fn().mockResolvedValue(0),
      update: vi.fn((_id: string, data: Partial<SecurityCheck>) =>
        Promise.resolve(row({ ...data })),
      ),
      retireData: vi.fn().mockResolvedValue(null),
    };
    mail = { send: vi.fn().mockResolvedValue(undefined) };
    service = new SecurityChecksService(
      repository as unknown as SecurityChecksRepository,
      { createQuietly: vi.fn().mockResolvedValue({ id: 'lead-1' }) } as unknown as LeadsService,
      mail as unknown as MailService,
      {
        isTest: true,
        siteUrl: 'https://codeqlick.com',
        leadsNotifyTo: 'hello@codeqlick.com',
      } as unknown as AppConfigService,
    );
  });

  it('counts the per-domain limit by registrable domain', async () => {
    await service.create(create);
    expect(repository.countByDomainSince).toHaveBeenCalledWith('lucia.com', expect.any(Date));
  });

  it('answers 503 when the day is full or the queue is long', async () => {
    repository.countSince.mockResolvedValue(DAILY_GLOBAL_LIMIT);
    await expect(service.create(create)).rejects.toMatchObject({ status: 503 });
    repository.countSince.mockResolvedValue(0);
    (service as unknown as { queue: string[] }).queue.push(...Array(MAX_QUEUE).fill('x'));
    await expect(service.create(create)).rejects.toMatchObject({ status: 503 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('gives up an old PENDING check: FAILED and the visitor is emailed', async () => {
    await service.giveUp(row().id);
    expect(repository.update).toHaveBeenCalledWith(
      row().id,
      expect.objectContaining({ status: 'FAILED', error: 'Interrupted' }),
    );
    expect(mail.send).toHaveBeenCalled();
    expect(mail.send.mock.calls[0]![0]).toMatchObject({ to: 'lucia@example.com' });
  });

  it('aborts what a timed-out check started', async () => {
    vi.useFakeTimers();
    try {
      let seen: AbortSignal | undefined;
      service.gather = (_domain, _retire, signal) => {
        seen = signal;
        return new Promise<SecurityInputs>(() => undefined);
      };
      const running = service.run(row().id);
      await vi.advanceTimersByTimeAsync(61_000);
      await running;
      expect(seen?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not wait for a Retire.js download inside a check', async () => {
    const fetchJson = vi.fn();
    service.fetchRetireJson = fetchJson;
    service.gather = (_domain, retire) => Promise.resolve({ ...withBody(''), retire });
    await service.run(row().id);
    expect(fetchJson).not.toHaveBeenCalled();
  });
});
