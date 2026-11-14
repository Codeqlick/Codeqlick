import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfigService } from '../../config/app-config.service.js';
import type { CloudMonitor } from '../../generated/prisma/client.js';
import type { MailService } from '../mail/mail.service.js';
import type { CloudCtx } from './cloud-caller.js';
import type { CloudMonitorsRepository, MonitorWithTeam } from './cloud-monitors.repository.js';
import { CloudMonitorsService, keywordError } from './cloud-monitors.service.js';
import type { CloudTeamsService } from './cloud-teams.service.js';
import { createMonitorSchema, updateMonitorSchema } from './cloud.schemas.js';

// What the checked site answers is up to each test (real fetching refuses test addresses).
const site = vi.hoisted(() => ({ status: 200, body: '', truncated: false }));
vi.mock('../site-audits/safe-fetch.js', async (original) => {
  const actual = await original<typeof import('../site-audits/safe-fetch.js')>();
  return {
    ...actual,
    safeFetch: vi.fn((url: string) =>
      Promise.resolve({
        url,
        status: site.status,
        headers: {},
        body: site.body,
        bytes: Buffer.byteLength(site.body),
        truncated: site.truncated,
        ttfbMs: 20,
        redirects: [],
        certificateValidTo: null,
      }),
    ),
  };
});
const { safeFetch } = await import('../site-audits/safe-fetch.js');

const now = new Date('2026-11-14T12:00:00Z');
const ctx = {} as CloudCtx;
const TEAM = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

function monitorRow(overrides: Partial<MonitorWithTeam> = {}): MonitorWithTeam {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    teamId: TEAM,
    projectId: null,
    name: 'Website',
    kind: 'HTTP',
    url: 'https://example.com/',
    keyword: null,
    keywordMode: 'CONTAINS',
    key: null,
    periodMinutes: null,
    graceMinutes: null,
    enabled: true,
    status: 'UP',
    statusSince: new Date('2026-11-01T00:00:00Z'),
    failures: 0,
    lastCheckedAt: null,
    lastPingAt: null,
    deadlineAt: null,
    lastError: null,
    certExpiresAt: null,
    certCheckedAt: null,
    certWarnedFor: null,
    alertIds: [USER],
    lastDownAlertAt: null,
    lastUpAlertAt: null,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    updatedAt: new Date('2026-11-01T00:00:00Z'),
    team: { slug: 'ops', name: 'Ops' },
    ...overrides,
  };
}

describe('Cloud monitors: text on the page', () => {
  let repository: {
    find: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    check: ReturnType<typeof vi.fn>;
    event: ReturnType<typeof vi.fn>;
    membersAmong: ReturnType<typeof vi.fn>;
    alertees: ReturnType<typeof vi.fn>;
  };
  let service: CloudMonitorsService;

  beforeEach(() => {
    site.status = 200;
    site.body = '';
    site.truncated = false;
    vi.mocked(safeFetch).mockClear();
    repository = {
      find: vi.fn().mockResolvedValue(monitorRow()),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn((data: Partial<CloudMonitor>) => Promise.resolve(monitorRow(data))),
      update: vi.fn((id: string, data: Partial<CloudMonitor>) =>
        Promise.resolve(monitorRow({ id, ...data })),
      ),
      check: vi.fn().mockResolvedValue(undefined),
      event: vi.fn().mockResolvedValue(undefined),
      membersAmong: vi.fn((teamId: string, ids: string[]) => Promise.resolve(ids)),
      alertees: vi.fn().mockResolvedValue([]),
    };
    const teams = {
      access: vi.fn().mockResolvedValue({ teamId: TEAM, team: { plan: 'FREE', name: 'Ops' } }),
      accessById: vi.fn().mockResolvedValue({ teamId: TEAM }),
      record: vi.fn().mockResolvedValue(undefined),
    };
    const config = {
      isTest: true,
      publicApiUrl: 'https://api.codeqlick.com/v1',
      cloudUrl: 'https://cloud.codeqlick.com',
      siteUrl: 'https://codeqlick.com',
    } as unknown as AppConfigService;
    service = new CloudMonitorsService(
      repository as unknown as CloudMonitorsRepository,
      teams as unknown as CloudTeamsService,
      { send: vi.fn().mockResolvedValue(undefined) } as unknown as MailService,
      config,
    );
  });

  describe('keywordError', () => {
    it('passes when the page contains the text, and is case-sensitive', () => {
      const monitor = { keyword: 'Add to cart', keywordMode: 'CONTAINS' as const };
      expect(keywordError(monitor, '<button>Add to cart</button>')).toBeNull();
      expect(keywordError(monitor, '<button>add to cart</button>')).toBe(
        "The page doesn't contain «Add to cart»",
      );
    });

    it('fails a "must not contain" check when the text is there', () => {
      const monitor = { keyword: 'Fatal error', keywordMode: 'NOT_CONTAINS' as const };
      expect(keywordError(monitor, '<p>Welcome</p>')).toBeNull();
      expect(keywordError(monitor, '<b>Fatal error</b>: oops')).toBe(
        'The page contains «Fatal error»',
      );
    });

    it('does nothing without a keyword', () => {
      expect(keywordError({ keyword: null, keywordMode: 'CONTAINS' }, '')).toBeNull();
    });
  });

  describe('the HTTP check', () => {
    it('reads 64 KB and only looks at the status without a keyword', async () => {
      site.body = 'anything';
      await service.checkHttp(monitorRow(), now);
      expect(safeFetch).toHaveBeenCalledWith(
        'https://example.com/',
        expect.objectContaining({ maxBytes: 64 * 1024 }),
      );
      expect(repository.check).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ ok: true, statusCode: 200, error: null }),
        now,
      );
    });

    it('reads up to 1 MB with a keyword and passes when the text is there', async () => {
      site.body = '<h1>Welcome to Ops</h1>';
      await service.checkHttp(monitorRow({ keyword: 'Welcome' }), now);
      expect(safeFetch).toHaveBeenCalledWith(
        'https://example.com/',
        expect.objectContaining({ maxBytes: 1024 * 1024 }),
      );
      expect(repository.check).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ ok: true, statusCode: 200, error: null }),
        now,
      );
    });

    it('counts a missing text as a failure, keeping the status code', async () => {
      site.body = '<h1>Maintenance</h1>';
      await service.checkHttp(monitorRow({ keyword: 'Welcome' }), now);
      const error = "The page doesn't contain «Welcome»";
      expect(repository.check).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ ok: false, statusCode: 200, error }),
        now,
      );
      // The first failure only counts.
      expect(repository.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ failures: 1, lastError: error }),
      );
      expect(repository.event).not.toHaveBeenCalled();
    });

    it('goes DOWN on the second failure in a row of a "must not contain" check', async () => {
      site.body = 'Fatal error: database unreachable';
      await service.checkHttp(
        monitorRow({ keyword: 'Fatal error', keywordMode: 'NOT_CONTAINS', failures: 1 }),
        now,
      );
      expect(repository.event).toHaveBeenCalledWith(
        expect.any(String),
        'DOWN',
        now,
        'The page contains «Fatal error»',
      );
      expect(repository.update).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'DOWN', failures: 2 }),
      );
    });

    it('checks the part read of a body cut at 1 MB', async () => {
      site.body = `${'a'.repeat(1024 * 1024 - 10)}Welcome`;
      site.truncated = true;
      await service.checkHttp(monitorRow({ keyword: 'Welcome' }), now);
      expect(repository.check).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ ok: true }),
        now,
      );
      site.body = 'a'.repeat(1024 * 1024);
      await service.checkHttp(monitorRow({ keyword: 'Welcome' }), now);
      expect(repository.check).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ ok: false, error: "The page doesn't contain «Welcome»" }),
        now,
      );
    });

    it('reports the HTTP status first when the page answers 400 or more', async () => {
      site.status = 503;
      site.body = 'Welcome';
      await service.checkHttp(monitorRow({ keyword: 'Welcome', keywordMode: 'NOT_CONTAINS' }), now);
      expect(repository.check).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ ok: false, statusCode: 503, error: 'HTTP 503' }),
        now,
      );
    });
  });

  describe('managing the text check', () => {
    it('stores the keyword and its mode on a new HTTP monitor', async () => {
      const input = createMonitorSchema.parse({
        kind: 'HTTP',
        name: 'Shop',
        url: 'https://example.com/',
        keyword: '  Add to cart ',
        alertIds: [USER],
      });
      const view = await service.create(ctx, 'ops', input, now);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ keyword: 'Add to cart', keywordMode: 'CONTAINS' }),
      );
      expect(view).toMatchObject({ keyword: 'Add to cart', keywordMode: 'CONTAINS' });
    });

    it('refuses a keyword on a heartbeat (create and update)', async () => {
      const heartbeat = {
        kind: 'HEARTBEAT',
        name: 'Backups',
        periodMinutes: 60,
        graceMinutes: 10,
        alertIds: [USER],
      };
      expect(createMonitorSchema.safeParse(heartbeat).success).toBe(true);
      expect(createMonitorSchema.safeParse({ ...heartbeat, keyword: 'ok' }).success).toBe(false);
      repository.find.mockResolvedValue(
        monitorRow({ kind: 'HEARTBEAT', url: null, key: 'cqh_x', periodMinutes: 60 }),
      );
      await expect(service.update(ctx, 'id', { keyword: 'ok' }, now)).rejects.toMatchObject({
        status: 400,
      });
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('validates the keyword: 1–100 characters, trimmed, no line breaks, null clears it', () => {
      expect(updateMonitorSchema.parse({ keyword: '  Hello  ' })).toEqual({ keyword: 'Hello' });
      expect(updateMonitorSchema.parse({ keyword: null })).toEqual({ keyword: null });
      for (const keyword of ['', '   ', 'a'.repeat(101), 'line\nbreak', 'end\r\n', 'x\r']) {
        expect(updateMonitorSchema.safeParse({ keyword }).success).toBe(false);
      }
      expect(updateMonitorSchema.safeParse({ keywordMode: 'MAYBE' }).success).toBe(false);
    });

    it('resets the failures when the keyword, its mode or the URL changes', async () => {
      repository.find.mockResolvedValue(monitorRow({ keyword: 'Welcome', failures: 1 }));
      await service.update(ctx, 'id', { keyword: 'Hello' }, now);
      expect(repository.update).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ keyword: 'Hello', failures: 0 }),
      );
      await service.update(ctx, 'id', { keyword: null }, now);
      expect(repository.update).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ keyword: null, failures: 0 }),
      );
      await service.update(ctx, 'id', { keywordMode: 'NOT_CONTAINS' }, now);
      expect(repository.update).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ keywordMode: 'NOT_CONTAINS', failures: 0 }),
      );
      await service.update(ctx, 'id', { url: 'https://example.org/' }, now);
      expect(repository.update).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ url: 'https://example.org/', failures: 0 }),
      );
      // Saving the same text again changes nothing.
      await service.update(ctx, 'id', { keyword: 'Welcome', name: 'Site' }, now);
      expect(repository.update).toHaveBeenLastCalledWith(expect.any(String), { name: 'Site' });
    });
  });
});
