import { z } from 'zod';

/** Stable budget values sent to the API; labels live in messages (Contact.budgets). */
export const BUDGET_VALUES = ['lt-5k', '5k-15k', '15k-40k', 'gt-40k', 'not-sure'] as const;
export type BudgetValue = (typeof BUDGET_VALUES)[number];

/**
 * Mirrors POST /v1/leads validation for instant feedback. The API remains the source of truth.
 * Issue messages are Validation message keys.
 */
export const contactSchema = z.object({
  name: z.string().trim().min(2, 'tooShort').max(120, 'tooLong'),
  email: z.string().trim().min(1, 'required').max(254, 'tooLong').pipe(z.email('email')),
  company: z.string().trim().max(120, 'tooLong'),
  budget: z.union([z.enum(BUDGET_VALUES, 'choice'), z.literal('')]),
  message: z.string().trim().min(10, 'messageTooShort').max(5000, 'tooLong'),
});

export type ContactValues = z.infer<typeof contactSchema>;

export const CONTACT_FIELDS = ['name', 'email', 'company', 'budget', 'message'] as const;
