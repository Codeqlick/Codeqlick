import { describe, expect, it } from 'vitest';
import { siteReportEmail } from './site-report.js';
import {
  allowanceFor,
  eventKind,
  maintenanceMonth,
  maintenanceOn,
  maintenanceState,
  maintenanceStatusFor,
  priorityWithPlan,
} from './site-maintenance.js';

describe('maintenance plan', () => {
  it('maps every Stripe subscription status to the plan state', () => {
    expect(maintenanceStatusFor('active')).toBe('ACTIVE');
    expect(maintenanceStatusFor('trialing')).toBe('ACTIVE');
    expect(maintenanceStatusFor('past_due')).toBe('PAST_DUE');
    expect(maintenanceStatusFor('incomplete')).toBe('PENDING');
    for (const status of ['canceled', 'unpaid', 'incomplete_expired', 'paused']) {
      expect(maintenanceStatusFor(status)).toBe('CANCELED');
    }
  });

  it('is on while paid, retried or included', () => {
    expect(maintenanceOn('ACTIVE', null)).toBe(true);
    expect(maintenanceOn('PAST_DUE', null)).toBe(true);
    expect(maintenanceOn('PENDING', null)).toBe(false);
    expect(maintenanceOn('CANCELED', null)).toBe(false);
    expect(maintenanceOn('NONE', null)).toBe(false);
    expect(maintenanceOn('NONE', 'Incluido en el proyecto a medida')).toBe(true);
  });

  it("reads the project's fields from the subscription", () => {
    expect(
      maintenanceState({
        id: 'sub_1',
        status: 'active',
        cancel_at_period_end: true,
        items: {
          data: [{ current_period_end: 1_800_000_000 }, { current_period_end: 1_800_000_100 }],
        },
      }),
    ).toEqual({
      maintenanceStatus: 'ACTIVE',
      maintenanceSubscriptionStatus: 'active',
      maintenanceSubscriptionId: 'sub_1',
      maintenancePeriodEnd: new Date(1_800_000_100_000),
      maintenanceCancelAtPeriodEnd: true,
    });
    expect(
      maintenanceState({
        id: 'sub_2',
        status: 'canceled',
        cancel_at_period_end: false,
        items: { data: [] },
      }).maintenancePeriodEnd,
    ).toBeNull();
  });

  it('counts change requests against the monthly allowance', () => {
    expect(allowanceFor(true, 'CHANGE', 0)).toBe(true);
    expect(allowanceFor(true, 'CHANGE', 2)).toBe(true);
    expect(allowanceFor(true, 'CHANGE', 3)).toBe(false);
    expect(allowanceFor(true, 'CHANGE', 7)).toBe(false);
    expect(allowanceFor(true, 'BUG', 0)).toBeNull();
    expect(allowanceFor(false, 'CHANGE', 0)).toBeNull();
  });

  it('raises the priority of requests with the plan, never lowering it', () => {
    expect(priorityWithPlan(true, 'LOW')).toBe('HIGH');
    expect(priorityWithPlan(true, 'NORMAL')).toBe('HIGH');
    expect(priorityWithPlan(true, 'URGENT')).toBe('URGENT');
    expect(priorityWithPlan(false, 'NORMAL')).toBe('NORMAL');
  });

  it('starts the month at midnight in Madrid', () => {
    // 1 December 2026, 00:30 in Madrid is still 30 November in UTC.
    expect(maintenanceMonth(new Date('2026-11-30T23:30:00Z'))).toEqual({
      key: '2026-12',
      start: new Date('2026-11-30T23:00:00Z'),
    });
    expect(maintenanceMonth(new Date('2026-07-15T10:00:00Z'))).toEqual({
      key: '2026-07',
      start: new Date('2026-06-30T22:00:00Z'),
    });
  });

  it("finds the kind in an object's metadata or its subscription's", () => {
    expect(eventKind({ metadata: { kind: 'site-maintenance' } })).toBe('site-maintenance');
    expect(
      eventKind({
        metadata: {},
        parent: { subscription_details: { metadata: { kind: 'site-maintenance' } } },
      }),
    ).toBe('site-maintenance');
    expect(eventKind({ metadata: { kind: 'cloud-pro' } })).toBe('cloud-pro');
    expect(eventKind({})).toBeUndefined();
  });

  it("adds the plan's changes to the monthly report", () => {
    const report = {
      projectId: 'p',
      site: 'alba.example',
      month: '2026-10',
      visits: null,
      messages: 2,
      uptime: 1,
      maintenance: { used: 2, limit: 3 },
    };
    const urls = { project: 'https://x/p', account: 'https://x/a', site: 'https://x' };
    const es = siteReportEmail({ name: 'Ada', email: 'a@x.test', locale: 'es' }, report, urls);
    expect(es.text).toContain('2 de 3 cambios usados');
    const en = siteReportEmail({ name: 'Ada', email: 'a@x.test', locale: 'en' }, report, urls);
    expect(en.text).toContain('2 of 3 changes used');
    const without = siteReportEmail(
      { name: 'Ada', email: 'a@x.test', locale: 'en' },
      { ...report, maintenance: null },
      urls,
    );
    expect(without.text).not.toContain('Maintenance plan');
  });
});
