/**
 * What a Stripe subscription bills a month before VAT, kept by the webhook for the admin
 * overview's MRR (architecture 4.17, decision 122). Pure, tested on its own.
 */

/** The part of a subscription item the amount is worked out from. */
export interface BilledItem {
  quantity?: number | null;
  price?: {
    unit_amount: number | null;
    recurring: { interval: string; interval_count: number } | null;
  } | null;
}

/** How many of each interval make a month. */
const PER_MONTH: Record<string, number> = {
  day: 365 / 12,
  week: 52 / 12,
  month: 1,
  year: 1 / 12,
};

/**
 * The items' prices times their quantity, brought to a month and rounded to the cent; `null` when
 * an item has no recurring price with an amount (nothing reliable to add up).
 */
export function monthlyAmountCents(items: readonly BilledItem[]): number | null {
  if (items.length === 0) return null;
  let total = 0;
  for (const item of items) {
    const price = item.price;
    const recurring = price?.recurring;
    const factor = recurring ? PER_MONTH[recurring.interval] : undefined;
    if (!price || price.unit_amount === null || !recurring || factor === undefined) return null;
    const every = Math.max(1, recurring.interval_count);
    total += (price.unit_amount * (item.quantity ?? 1) * factor) / every;
  }
  return Math.round(total);
}
