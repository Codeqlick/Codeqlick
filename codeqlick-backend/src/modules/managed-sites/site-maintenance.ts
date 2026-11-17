/**
 * The maintenance plan of managed sites as Stripe sees it (architecture 8.2, decision 110).
 * Pure, tested on its own; the support module also uses the allowance.
 */
import { monthlyAmountCents, type BilledItem } from '../../common/monthly-amount.js';
import { madridDay, madridToUtc } from '../bookings/booking-time.js';

export type MaintenanceStatus = 'NONE' | 'PENDING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';

/** Metadata that marks a Checkout Session, a customer or a subscription as a maintenance plan. */
export const SITE_MAINTENANCE_KIND = 'site-maintenance';

/** Change requests included each calendar month (Madrid). */
export const MAINTENANCE_ALLOWANCE = 3;

/** The plan's state from a Stripe subscription status. */
export function maintenanceStatusFor(status: string): MaintenanceStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'ACTIVE';
    case 'past_due':
      // Still on while Stripe retries the charge.
      return 'PAST_DUE';
    case 'incomplete':
      return 'PENDING';
    default:
      // canceled, unpaid, incomplete_expired, paused.
      return 'CANCELED';
  }
}

/** Whether the plan gives its services: paid (or being retried), or included by the team. */
export function maintenanceOn(status: MaintenanceStatus, includedReason: string | null): boolean {
  return includedReason !== null || status === 'ACTIVE' || status === 'PAST_DUE';
}

/** The project's fields from Stripe's subscription. */
export function maintenanceState(subscription: {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  items: { data: Array<{ current_period_end: number } & BilledItem> };
}): {
  maintenanceStatus: MaintenanceStatus;
  maintenanceSubscriptionStatus: string;
  maintenanceSubscriptionId: string;
  maintenancePeriodEnd: Date | null;
  maintenanceCancelAtPeriodEnd: boolean;
  /** A month's bill before VAT (the admin overview's MRR, decision 122). */
  maintenanceAmountCents: number | null;
} {
  const ends = subscription.items.data.map((item) => item.current_period_end);
  return {
    maintenanceStatus: maintenanceStatusFor(subscription.status),
    maintenanceSubscriptionStatus: subscription.status,
    maintenanceSubscriptionId: subscription.id,
    maintenancePeriodEnd: ends.length > 0 ? new Date(Math.max(...ends) * 1000) : null,
    maintenanceCancelAtPeriodEnd: subscription.cancel_at_period_end,
    maintenanceAmountCents: monthlyAmountCents(subscription.items.data),
  };
}

/** The Madrid calendar month of an instant: `yyyy-mm` and its first moment. */
export function maintenanceMonth(now: Date): { key: string; start: Date } {
  const key = madridDay(now).slice(0, 7);
  return { key, start: madridToUtc(`${key}-01`, '00:00') };
}

/**
 * Whether a new change request is one of the month's included ones: `null` when the plan is off
 * or the request isn't a change.
 */
export function allowanceFor(
  on: boolean,
  type: string,
  usedThisMonth: number,
  limit = MAINTENANCE_ALLOWANCE,
): boolean | null {
  if (!on || type !== 'CHANGE') return null;
  return usedThisMonth < limit;
}

/** The priority a request opened on a project with the plan on starts at. */
export function priorityWithPlan<T extends string>(on: boolean, priority: T): T | 'HIGH' {
  if (!on || priority === 'URGENT' || priority === 'HIGH') return priority;
  return 'HIGH';
}

/** What a webhook event's object says about its kind, wherever Stripe puts the metadata. */
export function eventKind(object: {
  metadata?: Record<string, string> | null;
  parent?: { subscription_details?: { metadata?: Record<string, string> | null } | null } | null;
}): string | undefined {
  return object.metadata?.kind ?? object.parent?.subscription_details?.metadata?.kind;
}
