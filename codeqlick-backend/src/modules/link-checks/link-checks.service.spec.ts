import { describe, expect, it, vi } from 'vitest';

// The sites the external links point at: what they answer is up to the test (no network).
const requested = vi.hoisted(() => [] as string[]);
vi.mock('../site-audits/safe-fetch.js', async (original) => {
  const actual = await original<typeof import('../site-audits/safe-fetch.js')>();
  return {
    ...actual,
    safeFetch: vi.fn(async (url: string) => {
      requested.push(url);
      return {
        url,
        status: url.includes('gone') ? 404 : 200,
        headers: {},
        body: '',
        bytes: 0,
        truncated: false,
        ttfbMs: 1,
        redirects: [],
        certificateValidTo: null,
      };
    }),
  };
});

import type { AppConfigService } from '../../config/app-config.service.js';
import type { LinkCheck } from '../../generated/prisma/client.js';
import type { MediaService } from '../media/media.service.js';
import type {
  LinkCheckData,
  LinkChecksRepository,
  LinkKey,
  LiveContent,
  RunTimes,
} from './link-checks.repository.js';
import {
  isRunDue,
  LinkChecksService,
  RETRY_AFTER_MS,
  RUN_EVERY_MS,
} from './link-checks.service.js';

const SITE = 'https://codeqlick.com';
const NOW = new Date('2026-11-14T12:00:00Z');

const CONTENT: LiveContent[] = [
  {
    type: 'POST',
    id: 'post-1',
    slug: 'hello',
    translations: [
      {
        locale: 'EN',
        content: [
          'See [our work](/en/work/acme), [a gone page](https://ext.example/gone#part),',
          'the [same page](https://ext.example/gone), [Spanish](/es/blog/hello) and',
          '[a draft](/en/blog/draft), [book a call](/es/citas/ana) and',
          '`[code](https://code.example)`.',
        ].join('\n'),
      },
      { locale: 'ES', content: 'Mira [el caso](/work/acme) y [esto](https://ext.example/gone).' },
    ],
  },
  {
    type: 'PORTFOLIO',
    id: 'case-1',
    slug: 'acme',
    translations: [{ locale: 'ES', content: '[Inicio](/)' }],
  },
];

function row(key: LinkKey, data: Partial<LinkCheck>): LinkCheck {
  return {
    id: `row-${key.url}`,
    ...key,
    internal: false,
    status: 'OK',
    statusCode: null,
    error: null,
    failures: 0,
    brokenSince: null,
    checkedAt: new Date('2026-11-07T12:00:00Z'),
    createdAt: new Date('2026-11-07T12:00:00Z'),
    ...data,
  };
}

function setup(existing: LinkCheck[] = [], times: Partial<RunTimes> = {}) {
  const saved: { key: LinkKey; data: LinkCheckData }[] = [];
  const repository = {
    liveContent: vi.fn(async () => CONTENT),
    findAll: vi.fn(async () => existing),
    deleteMany: vi.fn(async (ids: string[]) => ids.length),
    save: vi.fn(async (key: LinkKey, data: LinkCheckData) => {
      saved.push({ key, data });
      return row(key, data);
    }),
    runTimes: vi.fn(
      async (): Promise<RunTimes> => ({
        lastRunAt: null,
        lastAttemptAt: null,
        ...times,
      }),
    ),
    saveRunTimes: vi.fn(async () => {}),
  };
  const media = { exists: vi.fn(async () => false) };
  const config = { siteUrl: SITE, nodeEnv: 'test' };
  const service = new LinkChecksService(
    repository as unknown as LinkChecksRepository,
    media as unknown as MediaService,
    config as unknown as AppConfigService,
  );
  return { service, repository, saved };
}

describe('LinkChecksService.runFull', () => {
  it('checks every link of the live content once per address, keeping each place it appears', async () => {
    requested.length = 0;
    const stale = row(
      { url: 'https://old.example/', sourceType: 'POST', sourceId: 'post-1', locale: 'EN' },
      {},
    );
    const failedOnce = row(
      {
        url: 'https://ext.example/gone',
        sourceType: 'POST',
        sourceId: 'post-1',
        locale: 'EN',
      },
      { failures: 1, statusCode: 404 },
    );
    const { service, repository, saved } = setup([stale, failedOnce]);

    const summary = await service.runFull(NOW);

    // The external address is requested once, without its fragment; code is no link.
    expect(requested).toEqual(['https://ext.example/gone']);
    expect(summary).toEqual({ links: 9, requested: 1, broken: 1 });
    expect(repository.deleteMany).toHaveBeenCalledWith([stale.id]);
    expect(repository.saveRunTimes).toHaveBeenCalledWith({ lastRunAt: NOW });

    const state = (url: string, sourceId: string, locale: 'EN' | 'ES') =>
      saved.find(
        (entry) =>
          entry.key.url === url && entry.key.sourceId === sourceId && entry.key.locale === locale,
      )?.data;

    // Failed last week too: broken now.
    expect(state('https://ext.example/gone', 'post-1', 'EN')).toMatchObject({
      internal: false,
      status: 'BROKEN',
      failures: 2,
      statusCode: 404,
      brokenSince: NOW,
    });
    // The first failure of the others: not reported yet.
    expect(state('https://ext.example/gone#part', 'post-1', 'EN')).toMatchObject({
      status: 'OK',
      failures: 1,
    });
    expect(state('https://ext.example/gone', 'post-1', 'ES')).toMatchObject({ failures: 1 });

    // The case study only has Spanish: the website shows it in English too, so both work.
    expect(state(`${SITE}/en/work/acme`, 'post-1', 'EN')).toMatchObject({
      internal: true,
      status: 'OK',
      failures: 0,
      statusCode: 200,
    });
    // A post that isn't live is a 404.
    expect(state(`${SITE}/en/blog/draft`, 'post-1', 'EN')).toMatchObject({
      internal: true,
      status: 'OK',
      failures: 1,
      statusCode: 404,
    });
    expect(state(`${SITE}/work/acme`, 'post-1', 'ES')).toMatchObject({
      internal: true,
      failures: 0,
    });
    expect(state(`${SITE}/es/blog/hello`, 'post-1', 'EN')).toMatchObject({ failures: 0 });
    expect(state(`${SITE}/`, 'case-1', 'ES')).toMatchObject({ internal: true, failures: 0 });
    // A dynamic page can't be looked up: neither good nor bad.
    expect(state(`${SITE}/es/citas/ana`, 'post-1', 'EN')).toMatchObject({
      internal: true,
      status: 'OK',
      failures: 0,
      statusCode: null,
    });
    expect(saved.some((entry) => entry.key.url.includes('code.example'))).toBe(false);
  });
});

describe('LinkChecksService.runDue', () => {
  it('waits for the last run to be a week old', async () => {
    const recent = setup([], { lastRunAt: new Date(NOW.getTime() - RUN_EVERY_MS + 60_000) });
    await recent.service.runDue(NOW);
    expect(recent.repository.liveContent).not.toHaveBeenCalled();

    const due = setup([], { lastRunAt: new Date(NOW.getTime() - RUN_EVERY_MS) });
    await due.service.runDue(NOW);
    expect(due.repository.liveContent).toHaveBeenCalled();

    const never = setup([]);
    await never.service.runDue(NOW);
    expect(never.repository.liveContent).toHaveBeenCalled();
  });

  it('remembers a failed run, without throwing', async () => {
    const failing = setup([]);
    failing.repository.liveContent.mockRejectedValueOnce(new Error('database went away'));
    await expect(failing.service.runDue(NOW)).resolves.toBeUndefined();
    expect(failing.repository.saveRunTimes).toHaveBeenCalledWith({ lastAttemptAt: NOW });
  });
});

describe('isRunDue', () => {
  const ago = (ms: number) => new Date(NOW.getTime() - ms);

  it('runs weekly, or at once when there was no run', () => {
    expect(isRunDue(null, null, NOW)).toBe(true);
    expect(isRunDue(ago(RUN_EVERY_MS - 1), null, NOW)).toBe(false);
    expect(isRunDue(ago(RUN_EVERY_MS), null, NOW)).toBe(true);
  });

  it('retries a failed run no sooner than 6 hours after it', () => {
    const lastWeek = ago(RUN_EVERY_MS + 10 * 3_600_000);
    expect(isRunDue(lastWeek, ago(RETRY_AFTER_MS - 1), NOW)).toBe(false);
    expect(isRunDue(lastWeek, ago(RETRY_AFTER_MS), NOW)).toBe(true);
    expect(isRunDue(null, ago(60_000), NOW)).toBe(false);
    // A failure before the last good run doesn't count.
    expect(isRunDue(lastWeek, ago(RUN_EVERY_MS + 11 * 3_600_000), NOW)).toBe(true);
  });
});
