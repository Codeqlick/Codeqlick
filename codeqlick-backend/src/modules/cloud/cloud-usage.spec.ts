import { describe, expect, it } from 'vitest';
import { CLOUD_PLANS } from './cloud-plans.js';
import { madridMonth } from './cloud-form-fields.js';
import { cloudUsageAlertEmail } from './cloud-emails.js';
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

  it('ignores a limit of zero', () => {
    expect(crossing([{ key: 'builds', used: 5, limit: 0, percent: 100 }])).toEqual([]);
  });
});

describe('cloudUsageAlertEmail', () => {
  const base = {
    to: 'ada@example.com',
    team: 'web',
    key: 'builds' as const,
    used: 164,
    limit: 200,
    percent: 82,
    proHint: false,
    url: 'https://cloud.test/en/console/web',
    planUrl: 'https://cloud.test/en/console/web/plan',
    siteUrl: 'https://codeqlick.test',
  };

  it('writes English with the real percent, the amounts and the reset', () => {
    const mail = cloudUsageAlertEmail({ ...base, locale: 'en' });
    expect(mail.subject).toBe('Your team web used 82 % of its builds this month');
    expect(mail.text).toContain('164 of 200');
    expect(mail.text).toContain('on the 1st, Madrid time');
    expect(mail.text).toContain('https://cloud.test/en/console/web');
  });

  it('writes Spanish', () => {
    const mail = cloudUsageAlertEmail({
      ...base,
      locale: 'es',
      url: 'https://cloud.test/es/console/web',
    });
    expect(mail.subject).toBe('Tu equipo web ha usado el 82 % de sus builds este mes');
    expect(mail.text).toContain('164 de 200');
    expect(mail.text).toContain('el día 1, hora de Madrid');
  });

  it('formats storage in bytes units and resets when deployments are deleted', () => {
    const mail = cloudUsageAlertEmail({
      ...base,
      locale: 'en',
      key: 'storage',
      used: 900 * 1024 * 1024,
      limit: 1024 * 1024 * 1024,
      percent: 87,
    });
    expect(mail.text).toContain('900 MB of 1 GB');
    expect(mail.text).toContain('when you delete deployments');
  });

  it('mentions PRO only when asked to (a FREE team where billing is available)', () => {
    const free = cloudUsageAlertEmail({ ...base, locale: 'en', proHint: true });
    const pro = cloudUsageAlertEmail({ ...base, locale: 'en', proHint: false });
    expect(free.text).toContain('The PRO plan has higher limits');
    expect(free.text).toContain(base.planUrl);
    expect(pro.text).not.toContain('PRO');
    const es = cloudUsageAlertEmail({ ...base, locale: 'es', proHint: true });
    expect(es.text).toContain('El plan PRO tiene límites más altos');
  });
});
