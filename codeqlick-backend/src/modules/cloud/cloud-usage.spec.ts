import { describe, expect, it } from 'vitest';
import { CLOUD_PLANS } from './cloud-plans.js';
import { madridMonth } from './cloud-form-fields.js';
import { buildMeters, crossing, meterPercent, reachesThreshold } from './cloud-usage.js';

const none = {
  builds: 0,
  formSubmissions: 0,
  analyticsEvents: 0,
  storage: 0,
  deploymentsPerHour: 0,
};

describe('usage meters', () => {
  it('reaches the threshold at exactly 80 % and not before', () => {
    expect(reachesThreshold(159, 200)).toBe(false);
    expect(reachesThreshold(160, 200)).toBe(true);
    expect(reachesThreshold(201, 200)).toBe(true);
    expect(reachesThreshold(0, 200)).toBe(false);
  });

  it('shows the floored percent, which can pass 100', () => {
    expect(meterPercent(164, 200)).toBe(82);
    expect(meterPercent(199, 200)).toBe(99);
    expect(meterPercent(250, 200)).toBe(125);
    expect(meterPercent(0, 200)).toBe(0);
  });

  it('measures against the plan the team has', () => {
    const usage = { ...none, builds: 500 };
    const free = buildMeters(CLOUD_PLANS.FREE, usage);
    const pro = buildMeters(CLOUD_PLANS.PRO, usage);
    expect(free.find((m) => m.key === 'builds')).toEqual({
      key: 'builds',
      used: 500,
      limit: 200,
      percent: 250,
    });
    expect(pro.find((m) => m.key === 'builds')).toMatchObject({ limit: 3000, percent: 16 });
    expect(free.map((m) => m.key)).toEqual([
      'builds',
      'formSubmissions',
      'analyticsEvents',
      'storage',
      'deploymentsPerHour',
    ]);
  });

  it('picks the measures at or over the threshold', () => {
    const free = CLOUD_PLANS.FREE;
    const meters = buildMeters(free, {
      builds: 160,
      formSubmissions: 799,
      analyticsEvents: 50_000,
      storage: 0,
      deploymentsPerHour: 24,
    });
    expect(crossing(meters).map((m) => m.key)).toEqual([
      'builds',
      'analyticsEvents',
      'deploymentsPerHour',
    ]);
    expect(crossing(buildMeters(free, none))).toEqual([]);
  });

  it('keys the alert period to the Madrid month', () => {
    // 23:30 UTC on 30 November is already 1 December in Madrid.
    expect(madridMonth(new Date('2026-11-30T23:30:00Z')).key).toBe('2026-12');
    expect(madridMonth(new Date('2026-11-14T10:00:00Z')).key).toBe('2026-11');
  });
});
