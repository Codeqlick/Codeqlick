import { z } from 'zod';

/** A calendar day, `yyyy-mm-dd`. */
const daySchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use yyyy-mm-dd' })
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), { message: 'Invalid date' });

/**
 * The fields of the multipart form that uploads an invoice (all strings there). `amount` is in
 * euros, VAT included, with a dot or a comma for the cents.
 */
export const createInvoiceSchema = z.object({
  number: z.string().trim().min(1).max(40),
  issuedOn: daySchema,
  dueOn: z
    .union([daySchema, z.literal('')])
    .optional()
    .transform((value) => value || null),
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,7}([.,]\d{1,2})?$/, { message: 'Use an amount such as 1234.56' })
    .transform((value) => Math.round(Number(value.replace(',', '.')) * 100))
    .refine((cents) => cents > 0, { message: 'The amount must be above zero' }),
  notify: z
    .enum(['true', 'false', 'on'])
    .optional()
    .transform((value) => value === 'true' || value === 'on'),
});
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;

export const setInvoicePaidSchema = z.object({ paid: z.boolean() });
export type SetInvoicePaidInput = z.infer<typeof setInvoicePaidSchema>;

export const purchaseParamSchema = z.object({ purchaseId: z.uuid() });
export type PurchaseParam = z.infer<typeof purchaseParamSchema>;
