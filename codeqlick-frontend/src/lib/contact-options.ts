/*
 * Options of the contact form, kept apart from its Zod schema: the form runs in the browser, and
 * importing the schema would ship Zod with it (and its eval check trips the CSP).
 */

/** Stable budget values sent to the API; labels live in messages (Contact.budgets). */
export const BUDGET_VALUES = ['lt-5k', '5k-15k', '15k-40k', 'gt-40k', 'not-sure'] as const;
export type BudgetValue = (typeof BUDGET_VALUES)[number];
