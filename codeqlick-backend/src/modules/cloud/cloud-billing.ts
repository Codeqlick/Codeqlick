import { monthlyAmountCents, type BilledItem } from '../../common/monthly-amount.js';

/**
 * Cloud's PRO plan as Stripe sees it (architecture 4.13 "Plans and billing", decision 46).
 * Pure, tested on its own.
 */

/** Subscription states that keep (or make) a team PRO; `past_due` while Stripe retries. */
const PRO_STATES = new Set(['active', 'trialing', 'past_due']);

export function planFor(status: string): 'PRO' | 'FREE' {
  return PRO_STATES.has(status) ? 'PRO' : 'FREE';
}

/** The subscription fields a team keeps, from Stripe's subscription. */
export function subscriptionState(subscription: {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  items: { data: Array<{ current_period_end: number } & BilledItem> };
}): {
  plan: 'PRO' | 'FREE';
  stripeSubscriptionId: string;
  subscriptionStatus: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** A month's bill before VAT (the admin overview's MRR, decision 122). */
  subscriptionAmountCents: number | null;
} {
  const ends = subscription.items.data.map((item) => item.current_period_end);
  return {
    plan: planFor(subscription.status),
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    currentPeriodEnd: ends.length > 0 ? new Date(Math.max(...ends) * 1000) : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    subscriptionAmountCents: monthlyAmountCents(subscription.items.data),
  };
}

/** Metadata that marks a Checkout Session or a subscription as a Cloud team's PRO plan. */
export const CLOUD_PLAN_KIND = 'cloud-pro';
