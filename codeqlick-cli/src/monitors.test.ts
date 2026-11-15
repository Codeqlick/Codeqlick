import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Monitor } from './api.ts';
import {
  changeEnabled,
  findMonitors,
  monitorRows,
  monitorState,
  monitorTable,
  pickMonitor,
  spanText,
} from './cli.ts';

const now = Date.parse('2026-11-14T12:00:00Z');
const base: Monitor = {
  id: 'm1',
  name: 'Web',
  kind: 'HTTP',
  url: 'https://example.com',
  keyword: null,
  keywordMode: 'CONTAINS',
  heartbeatUrl: null,
  periodMinutes: 5,
  graceMinutes: null,
  projectId: null,
  enabled: true,
  status: 'UP',
  statusSince: '2026-11-14T09:00:00Z',
  lastCheckedAt: '2026-11-14T11:55:00Z',
  lastPingAt: null,
  deadlineAt: null,
  lastError: null,
  certExpiresAt: null,
  alertIds: [],
  createdAt: '2026-11-01T00:00:00Z',
};
const job: Monitor = {
  ...base,
  id: 'm2',
  name: 'Backup',
  kind: 'HEARTBEAT',
  url: null,
  enabled: false,
  status: 'UP',
  statusSince: '2026-11-10T12:00:00Z',
  lastCheckedAt: null,
  lastPingAt: '2026-11-14T11:59:30Z',
};

test('time spans read as minutes, hours or days', () => {
  assert.equal(spanText(10_000), '<1 min');
  assert.equal(spanText(5 * 60_000), '5 min');
  assert.equal(spanText(3 * 3_600_000), '3 h');
  assert.equal(spanText(4 * 86_400_000), '4 d');
});

test('a switched-off monitor shows PAUSED whatever its status', () => {
  assert.equal(monitorState(base), 'UP');
  assert.equal(monitorState(job), 'PAUSED');
});

test('the rows use lastCheckedAt for HTTP, lastPingAt for heartbeats, and - when none', () => {
  const rows = monitorRows([base, job, { ...base, id: 'm3', lastCheckedAt: null }], now);
  assert.deepEqual(rows[0], {
    name: 'Web',
    kind: 'HTTP',
    state: 'UP',
    since: '3 h',
    last: '5 min ago',
  });
  assert.deepEqual(rows[1], {
    name: 'Backup',
    kind: 'HEARTBEAT',
    state: 'PAUSED',
    since: '4 d',
    last: '<1 min ago',
  });
  assert.equal(rows[2]!.last, '-');
});

test('the table has a header and aligned columns', () => {
  const lines = monitorTable([base, job], now);
  assert.equal(lines.length, 3);
  assert.match(lines[0]!, /^NAME\s+KIND\s+STATE\s+SINCE\s+LAST CHECK$/);
  assert.match(lines[1]!, /^Web\s+HTTP\s+UP\s+3 h\s+5 min ago$/);
  assert.match(lines[2]!, /^Backup\s+HEARTBEAT\s+PAUSED\s+4 d\s+<1 min ago$/);
});

test('an argument is matched as an id first, then as an exact name', () => {
  const list = [base, job, { ...base, id: 'web' }, { ...base, id: 'm4', name: 'Backup' }];
  assert.deepEqual(
    findMonitors(list, 'm1').map((m) => m.id),
    ['m1'],
  );
  // An id wins over a monitor named like it.
  assert.deepEqual(
    findMonitors(
      [
        { ...base, id: 'a', name: 'b' },
        { ...base, id: 'b' },
      ],
      'b',
    ).map((m) => m.id),
    ['b'],
  );
  assert.deepEqual(
    findMonitors(list, 'Web').map((m) => m.id),
    ['m1', 'web'],
  );
  assert.deepEqual(
    findMonitors(list, 'Backup').map((m) => m.id),
    ['m2', 'm4'],
  );
  assert.deepEqual(findMonitors(list, 'web'), [list[2]]);
  assert.deepEqual(findMonitors(list, 'nope'), []);
});

test('no match or several matches is an error that says so', () => {
  const list = [base, { ...base, id: 'm5', kind: 'HEARTBEAT' as const }];
  assert.equal(pickMonitor(list, 'm5', 'acme').id, 'm5');
  assert.throws(() => pickMonitor(list, 'x', 'acme'), {
    message: 'There is no monitor "x" in the team "acme".',
  });
  assert.throws(() => pickMonitor(list, 'Web', 'acme'), {
    message: '2 monitors are named "Web": use an id.\n  m1  HTTP\n  m5  HEARTBEAT',
  });
});

test('pause and resume send the PATCH only when the state changes', async () => {
  const calls: Array<[string, boolean]> = [];
  const api = {
    setMonitorEnabled: async (id: string, enabled: boolean) => {
      calls.push([id, enabled]);
      return { ...base, id, enabled };
    },
  };
  assert.equal(await changeEnabled(api, base, true), base);
  assert.equal(await changeEnabled(api, job, false), job);
  assert.deepEqual(calls, []);
  assert.equal((await changeEnabled(api, base, false)).enabled, false);
  assert.equal((await changeEnabled(api, job, true)).enabled, true);
  assert.deepEqual(calls, [
    ['m1', false],
    ['m2', true],
  ]);
});
