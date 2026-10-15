import type { BudgetValue } from '@/lib/contact-options';

/**
 * A rough value per budget range the visitor picked (its middle; the floor for "more than"), to
 * weigh the pipeline. Leads without a budget, or "not sure", count as 0.
 */
const ESTIMATE: Record<BudgetValue, number> = {
  'lt-5k': 2_500,
  '5k-15k': 10_000,
  '15k-40k': 27_500,
  'gt-40k': 40_000,
  'not-sure': 0,
};

export function estimatedValue(budget: string | null): number {
  return budget && Object.hasOwn(ESTIMATE, budget) ? ESTIMATE[budget as BudgetValue] : 0;
}
