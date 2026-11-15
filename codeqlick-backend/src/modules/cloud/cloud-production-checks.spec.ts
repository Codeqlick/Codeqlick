import { describe, expect, it } from 'vitest';
import type { CheckResult, CheckStatus } from '../site-audits/site-audit-checks.js';
import {
  compareAudits,
  dropLines,
  nextProductionCheck,
  productionSlot,
  skipReason,
} from './cloud-production-checks.js';

/** The first project id (from a counter) whose slot satisfies `wanted`. */
function idWith(wanted: (slot: ReturnType<typeof productionSlot>) => boolean): string {
  for (let i = 0; i < 100_000; i++) {
    const id = `project-${i}`;
    if (wanted(productionSlot(id))) return id;
  }
  throw new Error('No id with that slot');
}

describe("a project's weekly slot", () => {
  it('is always the same for the same id', () => {
    expect(productionSlot('4b1c7a9e-0000-4000-8000-000000000001')).toEqual(
      productionSlot('4b1c7a9e-0000-4000-8000-000000000001'),
    );
  });

  it('falls on a weekday 1–7, an hour 1–5 and a minute 0–59, and spreads', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const slot = productionSlot(`project-${i}`);
      expect(slot.weekday).toBeGreaterThanOrEqual(1);
      expect(slot.weekday).toBeLessThanOrEqual(7);
      expect(slot.hour).toBeGreaterThanOrEqual(1);
      expect(slot.hour).toBeLessThanOrEqual(5);
      expect(slot.minute).toBeGreaterThanOrEqual(0);
      expect(slot.minute).toBeLessThanOrEqual(59);
      seen.add(`${slot.weekday}-${slot.hour}-${slot.minute}`);
    }
    expect(seen.size).toBeGreaterThan(300);
  });
});

describe('the next weekly run, in Madrid time', () => {
  // Sundays at 01:MM Madrid: the clocks change at 02:00 or 03:00 on those Sundays, after the slot.
  const id = idWith((slot) => slot.weekday === 7 && slot.hour === 1);
  const { minute } = productionSlot(id);
  const utc = (y: number, m: number, d: number, h: number) =>
    new Date(Date.UTC(y, m - 1, d, h, minute)).toISOString();

  it('is 01:MM CET in winter (00:MM UTC)', () => {
    expect(nextProductionCheck(id, new Date('2026-01-10T12:00:00Z')).toISOString()).toBe(
      utc(2026, 1, 11, 0),
    );
  });

  it('is 01:MM CEST in summer (23:MM UTC the day before)', () => {
    expect(nextProductionCheck(id, new Date('2026-07-01T12:00:00Z')).toISOString()).toBe(
      utc(2026, 7, 4, 23),
    );
  });

  it('keeps the wall-clock time when the clocks go forward (March)', () => {
    expect(nextProductionCheck(id, new Date('2026-03-22T12:00:00Z')).toISOString()).toBe(
      utc(2026, 3, 29, 0),
    );
    expect(nextProductionCheck(id, new Date('2026-03-29T12:00:00Z')).toISOString()).toBe(
      utc(2026, 4, 4, 23),
    );
  });

  it('keeps the wall-clock time when the clocks go back (October)', () => {
    expect(nextProductionCheck(id, new Date('2026-10-20T12:00:00Z')).toISOString()).toBe(
      utc(2026, 10, 24, 23),
    );
    expect(nextProductionCheck(id, new Date('2026-10-25T12:00:00Z')).toISOString()).toBe(
      utc(2026, 11, 1, 0),
    );
  });

  it('is strictly after the moment asked, a week on when it is exactly the slot', () => {
    const slot = nextProductionCheck(id, new Date('2026-01-10T12:00:00Z'));
    const following = nextProductionCheck(id, slot);
    expect(following.getTime() - slot.getTime()).toBe(7 * 86_400_000);
  });
});

function audit(
  score: number,
  categories: { speed: number; mobile: number; seo: number; security: number },
  statuses: Partial<Record<string, CheckStatus>> = {},
) {
  const checks: CheckResult[] = Object.entries(statuses).map(([id, status]) => ({
    id: id as CheckResult['id'],
    status: status!,
  }));
  return { score, result: { finalUrl: 'https://a.test/', categories, checks } };
}

const even = { speed: 90, mobile: 90, seo: 90, security: 90 };

describe('when a check dropped', () => {
  it('is not a drop for small moves or a rise', () => {
    expect(compareAudits(audit(90, even), audit(81, even))).toBeNull();
    expect(compareAudits(audit(80, even), audit(95, even))).toBeNull();
  });

  it('is a drop of 10 points or more overall', () => {
    expect(compareAudits(audit(90, even), audit(80, even))).toEqual({
      score: { from: 90, to: 80 },
      categories: [],
      checks: [],
    });
  });

  it('is a drop of 10 points or more in one category', () => {
    const drop = compareAudits(audit(90, even), audit(86, { ...even, seo: 80 }));
    expect(drop).toEqual({
      score: null,
      categories: [{ key: 'seo', from: 90, to: 80 }],
      checks: [],
    });
  });

  it('is a drop when a check goes from pass to fail', () => {
    const drop = compareAudits(
      audit(90, even, { hsts: 'pass', h1: 'warn', title: 'pass' }),
      audit(89, even, { hsts: 'fail', h1: 'fail', title: 'warn' }),
    );
    expect(drop?.checks).toEqual([{ id: 'hsts', category: 'security' }]);
    expect(drop?.score).toBeNull();
  });

  it('ignores the checks that vary between runs', () => {
    expect(
      compareAudits(
        audit(90, even, { ttfb: 'pass', 'psi-performance': 'pass', 'psi-lcp': 'pass' }),
        audit(89, even, { ttfb: 'fail', 'psi-performance': 'fail', 'psi-lcp': 'fail' }),
      ),
    ).toBeNull();
  });

  it('does not compare a check missing from one of the results', () => {
    expect(compareAudits(audit(90, even, {}), audit(90, even, { hsts: 'fail' }))).toBeNull();
    expect(compareAudits(audit(90, even, { hsts: 'pass' }), audit(90, even, {}))).toBeNull();
  });

  it('keeps volatile failures in the scores: a big fall still counts', () => {
    expect(
      compareAudits(
        audit(95, even, { ttfb: 'pass' }),
        audit(70, { ...even, speed: 60 }, { ttfb: 'fail' }),
      ),
    ).toMatchObject({ score: { from: 95, to: 70 }, checks: [] });
  });
});

describe('the lines of a drop', () => {
  const drop = compareAudits(
    audit(92, { ...even, seo: 95 }, { hsts: 'pass' }),
    audit(78, { ...even, seo: 70 }, { hsts: 'fail' }),
  )!;

  it('lists the score, then categories, then checks, in English', () => {
    expect(dropLines(drop, 'en')).toEqual([
      { label: 'Score', value: '92 → 78' },
      { label: 'Google', value: '95 → 70' },
      { label: expect.any(String), value: 'pass → fail' },
    ]);
  });

  it('and in Spanish', () => {
    const lines = dropLines(drop, 'es');
    expect(lines[0]).toEqual({ label: 'Nota', value: '92 → 78' });
    expect(lines[2]!.value).toBe('bien → fallo');
  });
});

describe('when a due project is not checked', () => {
  const live = {
    deletedAt: null,
    suspendedAt: null,
    productionDeploymentId: 'd1',
    protection: 'OFF' as const,
  };

  it('is checked when live, with previews protected', () => {
    expect(skipReason(live)).toBeNull();
    expect(skipReason({ ...live, protection: 'PREVIEWS' })).toBeNull();
  });

  it('is skipped when deleted, suspended, without production or password protected', () => {
    expect(skipReason({ ...live, deletedAt: new Date() })).toMatch(/deleted/);
    expect(skipReason({ ...live, suspendedAt: new Date() })).toMatch(/suspended/);
    expect(skipReason({ ...live, productionDeploymentId: null })).toMatch(/production/);
    expect(skipReason({ ...live, protection: 'ALL' })).toMatch(/password/);
  });
});
