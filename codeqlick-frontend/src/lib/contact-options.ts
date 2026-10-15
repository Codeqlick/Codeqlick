/*
 * Options of the contact form, kept apart from its Zod schema: the form runs in the browser, and
 * importing the schema would ship Zod with it (and its eval check trips the CSP).
 */

/** What the visitor needs; labels live in messages (Contact.projectTypes). */
export const PROJECT_TYPES = ['web', 'custom', 'mobile', 'design', 'support', 'not-sure'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

/**
 * Budget ranges the form used to ask for; older leads still carry them, so the admin panel keeps
 * their labels (Contact.budgets).
 */
export const BUDGET_VALUES = ['lt-5k', '5k-15k', '15k-40k', 'gt-40k', 'not-sure'] as const;
export type BudgetValue = (typeof BUDGET_VALUES)[number];
