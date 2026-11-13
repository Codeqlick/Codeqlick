import { describe, expect, it } from 'vitest';
import { planFor, subscriptionState } from './cloud-billing.js';

describe('Cloud billing', () => {
  it('keeps PRO while the subscription is paid or being retried', () => {
    expect(planFor('active')).toBe('PRO');
    expect(planFor('trialing')).toBe('PRO');
    expect(planFor('past_due')).toBe('PRO');
    expect(planFor('canceled')).toBe('FREE');
    expect(planFor('unpaid')).toBe('FREE');
    expect(planFor('incomplete')).toBe('FREE');
    expect(planFor('incomplete_expired')).toBe('FREE');
  });

  it('reads the period end from the subscription items', () => {
    expect(
      subscriptionState({
        id: 'sub_1',
        status: 'active',
        cancel_at_period_end: true,
        items: { data: [{ current_period_end: 1_800_000_000 }] },
      }),
    ).toEqual({
      plan: 'PRO',
      stripeSubscriptionId: 'sub_1',
      subscriptionStatus: 'active',
      currentPeriodEnd: new Date(1_800_000_000_000),
      cancelAtPeriodEnd: true,
    });
  });
});
