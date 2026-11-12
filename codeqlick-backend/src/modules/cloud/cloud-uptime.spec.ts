import { describe, expect, it } from 'vitest';
import { dailyUptime, incidents, overall, uptime, type StateChange } from './cloud-uptime.js';

const at = (iso: string) => new Date(iso);

describe('Cloud monitor uptime', () => {
  // Madrid is UTC+1 in November: the 12th runs from 11-11T23:00Z to 11-12T23:00Z.
  const changes: StateChange[] = [
    { status: 'UP', at: at('2026-11-11T23:00:00Z') },
    { status: 'DOWN', at: at('2026-11-12T11:00:00Z'), error: 'HTTP 502' },
    { status: 'UP', at: at('2026-11-12T17:00:00Z') },
  ];

  it('measures the share of time not down per Madrid day', () => {
    const days = dailyUptime(changes, 3, at('2026-11-13T11:00:00Z'));
    expect(days.map((d) => d.day)).toEqual(['2026-11-11', '2026-11-12', '2026-11-13']);
    expect(days[0]!.ratio).toBeNull(); // nothing measured before the first state
    expect(days[1]!.ratio).toBeCloseTo(18 / 24); // 6 hours down
    expect(days[2]!.ratio).toBe(1);
  });

  it('leaves paused and unknown time out', () => {
    const paused: StateChange[] = [
      { status: 'UP', at: at('2026-11-12T00:00:00Z') },
      { status: 'PAUSED', at: at('2026-11-12T06:00:00Z') },
      { status: 'DOWN', at: at('2026-11-12T12:00:00Z') },
    ];
    expect(uptime(paused, at('2026-11-12T00:00:00Z'), at('2026-11-12T18:00:00Z'))).toBeCloseTo(0.5);
  });

  it('lists incidents, the open one too', () => {
    const now = at('2026-11-13T12:00:00Z');
    const list = incidents(
      [...changes, { status: 'DOWN', at: at('2026-11-13T11:30:00Z'), error: 'timeout' }],
      at('2026-11-01T00:00:00Z'),
      now,
    );
    expect(list).toEqual([
      { start: '2026-11-13T11:30:00.000Z', end: null, minutes: 30, error: 'timeout' },
      {
        start: '2026-11-12T11:00:00.000Z',
        end: '2026-11-12T17:00:00.000Z',
        minutes: 360,
        error: 'HTTP 502',
      },
    ]);
  });

  it('says the overall state', () => {
    expect(overall(['UP', 'UP'])).toBe('operational');
    expect(overall(['UP', 'DOWN'])).toBe('partial');
    expect(overall(['DOWN', 'PAUSED'])).toBe('major');
    expect(overall(['UNKNOWN'])).toBe('unknown');
  });
});
