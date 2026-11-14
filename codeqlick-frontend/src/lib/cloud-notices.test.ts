import { describe, expect, it } from 'vitest';
import type { CloudPublicNotice } from '@/lib/api/cloud';
import {
  groupPublicNotices,
  isNoticeOpen,
  noticeMonitorNames,
  noticeTone,
  parseNoticeWindow,
  parseUpdateState,
  updateStates,
} from './cloud-notices';

function notice(
  over: Partial<CloudPublicNotice> & Pick<CloudPublicNotice, 'id'>,
): CloudPublicNotice {
  return {
    kind: 'INCIDENT',
    title: over.id,
    state: 'INVESTIGATING',
    monitors: [],
    startsAt: null,
    endsAt: null,
    resolvedAt: null,
    createdAt: '2026-11-14T10:00:00.000Z',
    updates: [],
    ...over,
  };
}

describe('isNoticeOpen', () => {
  it('is open until resolved or completed', () => {
    expect(isNoticeOpen('INVESTIGATING')).toBe(true);
    expect(isNoticeOpen('MONITORING')).toBe(true);
    expect(isNoticeOpen('SCHEDULED')).toBe(true);
    expect(isNoticeOpen('IN_PROGRESS')).toBe(true);
    expect(isNoticeOpen('RESOLVED')).toBe(false);
    expect(isNoticeOpen('COMPLETED')).toBe(false);
  });
});

describe('noticeTone', () => {
  it('keeps maintenance calm and incidents in alarm colours', () => {
    expect(noticeTone('MAINTENANCE', 'SCHEDULED')).toBe('info');
    expect(noticeTone('MAINTENANCE', 'IN_PROGRESS')).toBe('info');
    expect(noticeTone('MAINTENANCE', 'COMPLETED')).toBe('success');
    expect(noticeTone('INCIDENT', 'INVESTIGATING')).toBe('danger');
    expect(noticeTone('INCIDENT', 'IDENTIFIED')).toBe('warning');
    expect(noticeTone('INCIDENT', 'RESOLVED')).toBe('success');
  });
});

describe('update states', () => {
  it('limits the states to the kind', () => {
    expect(updateStates('INCIDENT')).toEqual([
      'INVESTIGATING',
      'IDENTIFIED',
      'MONITORING',
      'RESOLVED',
    ]);
    expect(updateStates('MAINTENANCE')).toEqual(['', 'COMPLETED']);
  });

  it('refuses a state of the other kind', () => {
    expect(parseUpdateState('INCIDENT', 'RESOLVED')).toBe('RESOLVED');
    expect(parseUpdateState('INCIDENT', '')).toBeNull();
    expect(parseUpdateState('INCIDENT', 'COMPLETED')).toBeNull();
    expect(parseUpdateState('MAINTENANCE', '')).toBe('');
    expect(parseUpdateState('MAINTENANCE', 'COMPLETED')).toBe('COMPLETED');
    expect(parseUpdateState('MAINTENANCE', 'IN_PROGRESS')).toBeNull();
  });
});

describe('parseNoticeWindow', () => {
  it('reads Madrid time', () => {
    expect(parseNoticeWindow('2026-11-20T22:00', '2026-11-21T01:30')).toEqual({
      ok: true,
      window: { startsAt: '2026-11-20T21:00:00.000Z', endsAt: '2026-11-21T00:30:00.000Z' },
    });
  });

  it('says which field is wrong', () => {
    expect(parseNoticeWindow('', '2026-11-21T01:30')).toEqual({
      ok: false,
      field: 'startsAt',
      problem: 'date',
    });
    expect(parseNoticeWindow('2026-11-20T22:00', 'soon')).toEqual({
      ok: false,
      field: 'endsAt',
      problem: 'date',
    });
    expect(parseNoticeWindow('2026-11-20T22:00', '2026-11-20T22:00')).toMatchObject({
      ok: false,
      problem: 'window',
    });
    expect(parseNoticeWindow('2026-11-20T22:00', '2026-11-28T22:01')).toMatchObject({
      ok: false,
      problem: 'window',
    });
    expect(parseNoticeWindow('2026-11-20T22:00', '2026-11-27T22:00').ok).toBe(true);
  });
});

describe('groupPublicNotices', () => {
  it('puts incidents first, then maintenance in progress, then upcoming, and closed apart', () => {
    const groups = groupPublicNotices([
      notice({
        id: 'upcoming-later',
        kind: 'MAINTENANCE',
        state: 'SCHEDULED',
        startsAt: '2026-11-20T10:00:00.000Z',
      }),
      notice({ id: 'old-incident', createdAt: '2026-11-13T10:00:00.000Z' }),
      notice({
        id: 'resolved',
        state: 'RESOLVED',
        resolvedAt: '2026-11-10T10:00:00.000Z',
      }),
      notice({
        id: 'upcoming-soon',
        kind: 'MAINTENANCE',
        state: 'SCHEDULED',
        startsAt: '2026-11-15T10:00:00.000Z',
      }),
      notice({
        id: 'running',
        kind: 'MAINTENANCE',
        state: 'IN_PROGRESS',
        startsAt: '2026-11-14T09:00:00.000Z',
      }),
      notice({ id: 'new-incident', state: 'IDENTIFIED', createdAt: '2026-11-14T11:00:00.000Z' }),
      notice({
        id: 'completed',
        kind: 'MAINTENANCE',
        state: 'COMPLETED',
        startsAt: '2026-11-12T09:00:00.000Z',
        endsAt: '2026-11-12T10:00:00.000Z',
      }),
    ]);
    const ids = (list: CloudPublicNotice[]) => list.map((n) => n.id);
    expect(ids(groups.incidents)).toEqual(['new-incident', 'old-incident']);
    expect(ids(groups.inProgress)).toEqual(['running']);
    expect(ids(groups.upcoming)).toEqual(['upcoming-soon', 'upcoming-later']);
    expect(ids(groups.closed)).toEqual(['completed', 'resolved']);
  });
});

describe('noticeMonitorNames', () => {
  it("names a notice's monitors in the team's order", () => {
    const monitors = [
      { id: 'a', name: 'API' },
      { id: 'b', name: 'Web' },
      { id: 'c', name: 'Cron' },
    ];
    expect(noticeMonitorNames(['c', 'a', 'gone'], monitors)).toEqual(['API', 'Cron']);
  });
});
