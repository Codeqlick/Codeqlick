import { describe, expect, it } from 'vitest';
import {
  closedAt,
  earliestNewStart,
  isOpen,
  maintenanceWindow,
  monitorsInMaintenance,
  noticeState,
  publicOrder,
  windowProblem,
  windowsFor,
  withoutWindows,
  type NoticeTiming,
} from './cloud-status-notices.js';
import { incidents, uptime, type StateChange } from './cloud-uptime.js';

const at = (iso: string) => new Date(iso);
const HOUR = 3_600_000;
const DAY = 86_400_000;

const maintenance = (over: Partial<NoticeTiming> = {}): NoticeTiming => ({
  kind: 'MAINTENANCE',
  state: 'SCHEDULED',
  monitorIds: ['a'],
  startsAt: at('2026-11-14T10:00:00Z'),
  endsAt: at('2026-11-14T12:00:00Z'),
  resolvedAt: null,
  createdAt: at('2026-11-13T09:00:00Z'),
  ...over,
});
const incident = (over: Partial<NoticeTiming> = {}): NoticeTiming => ({
  kind: 'INCIDENT',
  state: 'INVESTIGATING',
  monitorIds: ['a'],
  startsAt: null,
  endsAt: null,
  resolvedAt: null,
  createdAt: at('2026-11-14T08:00:00Z'),
  ...over,
});

describe('Cloud status notices', () => {
  it('derives a maintenance phase from the time', () => {
    const notice = maintenance();
    expect(noticeState(notice, at('2026-11-14T09:59:00Z'))).toBe('SCHEDULED');
    expect(noticeState(notice, at('2026-11-14T10:00:00Z'))).toBe('IN_PROGRESS');
    expect(noticeState(notice, at('2026-11-14T12:00:00Z'))).toBe('COMPLETED');
    const early = maintenance({ resolvedAt: at('2026-11-14T11:00:00Z'), state: 'COMPLETED' });
    expect(noticeState(early, at('2026-11-14T11:30:00Z'))).toBe('COMPLETED');
    expect(isOpen(notice, at('2026-11-14T11:00:00Z'))).toBe(true);
    expect(isOpen(notice, at('2026-11-14T13:00:00Z'))).toBe(false);
    expect(closedAt(notice, at('2026-11-14T13:00:00Z'))).toEqual(at('2026-11-14T12:00:00Z'));
    expect(closedAt(early, at('2026-11-14T11:30:00Z'))).toEqual(at('2026-11-14T11:00:00Z'));
  });

  it('keeps an incident open until it is resolved', () => {
    const now = at('2026-11-14T09:00:00Z');
    expect(isOpen(incident(), now)).toBe(true);
    expect(noticeState(incident({ state: 'MONITORING' }), now)).toBe('MONITORING');
    const resolved = incident({ state: 'RESOLVED', resolvedAt: at('2026-11-14T08:30:00Z') });
    expect(isOpen(resolved, now)).toBe(false);
    expect(closedAt(resolved, now)).toEqual(at('2026-11-14T08:30:00Z'));
  });

  it('finds the monitors under a maintenance in progress', () => {
    const notices = [
      maintenance({ monitorIds: ['a', 'b'] }),
      maintenance({ monitorIds: ['c'], startsAt: at('2026-11-15T10:00:00Z') }),
      incident({ monitorIds: ['d'] }),
    ];
    expect([...monitorsInMaintenance(notices, at('2026-11-14T11:00:00Z'))]).toEqual(['a', 'b']);
    expect(monitorsInMaintenance(notices, at('2026-11-14T13:00:00Z')).size).toBe(0);
  });

  it('cuts a window short when the maintenance ended early', () => {
    expect(maintenanceWindow(maintenance({ resolvedAt: at('2026-11-14T11:00:00Z') }))).toEqual({
      from: at('2026-11-14T10:00:00Z'),
      to: at('2026-11-14T11:00:00Z'),
    });
    // Ended before it began: no window.
    expect(maintenanceWindow(maintenance({ resolvedAt: at('2026-11-14T09:00:00Z') }))).toBeNull();
    expect(maintenanceWindow(incident())).toBeNull();
    expect(windowsFor([maintenance(), maintenance({ monitorIds: ['b'] })], 'a')).toHaveLength(1);
  });

  it('takes maintenance out of uptime and incidents', () => {
    const changes: StateChange[] = [
      { status: 'UP', at: at('2026-11-14T00:00:00Z') },
      { status: 'DOWN', at: at('2026-11-14T10:30:00Z'), error: 'HTTP 503' },
      { status: 'UP', at: at('2026-11-14T11:30:00Z') },
      { status: 'DOWN', at: at('2026-11-14T15:00:00Z'), error: 'timeout' },
    ];
    const windows = [{ from: at('2026-11-14T10:00:00Z'), to: at('2026-11-14T12:00:00Z') }];
    const masked = withoutWindows(changes, windows);
    expect(masked.map((c) => [c.status, c.at.toISOString()])).toEqual([
      ['UP', '2026-11-14T00:00:00.000Z'],
      ['PAUSED', '2026-11-14T10:00:00.000Z'],
      ['UP', '2026-11-14T12:00:00.000Z'],
      ['DOWN', '2026-11-14T15:00:00.000Z'],
    ]);
    // 16 measured hours, 3 down (15:00–18:00); the outage inside the window doesn't count.
    const from = at('2026-11-14T00:00:00Z');
    expect(uptime(masked, from, at('2026-11-14T18:00:00Z'))).toBeCloseTo(13 / 16);
    expect(incidents(masked, from, at('2026-11-14T16:00:00Z'))).toHaveLength(1);
    expect(withoutWindows(changes, [])).toBe(changes);
  });

  it('brings a down state back when the window ends', () => {
    const changes: StateChange[] = [
      { status: 'UP', at: at('2026-11-14T00:00:00Z') },
      { status: 'DOWN', at: at('2026-11-14T11:00:00Z'), error: 'HTTP 502' },
    ];
    const masked = withoutWindows(changes, [
      { from: at('2026-11-14T10:00:00Z'), to: at('2026-11-14T12:00:00Z') },
      { from: at('2026-11-14T11:30:00Z'), to: at('2026-11-14T13:00:00Z') },
    ]);
    expect(masked.map((c) => [c.status, c.at.toISOString(), c.error])).toEqual([
      ['UP', '2026-11-14T00:00:00.000Z', null],
      ['PAUSED', '2026-11-14T10:00:00.000Z', null],
      ['DOWN', '2026-11-14T13:00:00.000Z', 'HTTP 502'],
    ]);
  });

  it('checks a maintenance window', () => {
    const now = at('2026-11-14T10:00:00Z');
    const plus = (ms: number) => new Date(now.getTime() + ms);
    expect(windowProblem(plus(HOUR), plus(2 * HOUR), now, earliestNewStart(now))).toBeNull();
    expect(windowProblem(plus(2 * HOUR), plus(HOUR), now, null)).toMatch(/end after/);
    expect(windowProblem(plus(HOUR), plus(HOUR + 7 * DAY + 1), now, null)).toMatch(/7 days/);
    expect(windowProblem(plus(91 * DAY), plus(92 * DAY), now, null)).toMatch(/90 days/);
    expect(windowProblem(plus(-30 * 60_000), plus(HOUR), now, earliestNewStart(now))).toBeNull();
    expect(windowProblem(plus(-2 * HOUR), plus(HOUR), now, earliestNewStart(now))).toMatch(/past/);
    expect(windowProblem(plus(-2 * HOUR), plus(HOUR), now, null)).toBeNull();
  });

  it('orders notices as the public page shows them', () => {
    const now = at('2026-11-14T11:00:00Z');
    const on = (day: string) =>
      maintenance({ startsAt: at(`${day}T10:00:00Z`), endsAt: at(`${day}T11:00:00Z`) });
    const list = [
      { ...incident({ state: 'RESOLVED', resolvedAt: at('2026-11-13T10:00:00Z') }), id: 'old' },
      { ...on('2026-11-16'), id: 'later' },
      { ...on('2026-11-15'), id: 'soon' },
      { ...maintenance(), id: 'now' },
      { ...incident(), id: 'first' },
      { ...incident({ createdAt: at('2026-11-14T10:00:00Z') }), id: 'newer' },
      { ...incident({ state: 'RESOLVED', resolvedAt: at('2026-11-14T09:00:00Z') }), id: 'recent' },
    ];
    expect(publicOrder(list, now).map((n) => n.id)).toEqual([
      'newer',
      'first',
      'now',
      'soon',
      'later',
      'recent',
      'old',
    ]);
  });
});
