import { z } from 'zod';
import { localeSchema, paginationSchema } from '../../common/schemas/common.schemas.js';

export const leadStatusSchema = z.enum([
  'NEW',
  'TALKING',
  'CALL',
  'PROPOSAL',
  'WON',
  'LOST',
  'SPAM',
]);

export const lostReasonSchema = z.enum([
  'PRICE',
  'NO_RESPONSE',
  'NOT_A_FIT',
  'CHOSE_OTHER',
  'TIMING',
  'OTHER',
]);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === undefined || value === '' ? undefined : value));

export const createLeadSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.email().max(254),
    company: optionalText(160),
    budget: optionalText(80),
    message: z.string().trim().min(10).max(5000),
    locale: localeSchema,
    /** Honeypot: humans never see this field, bots fill it in. */
    website: z.string().max(500).optional(),
  })
  .strict();
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const listLeadsQuerySchema = paginationSchema.extend({
  status: leadStatusSchema.optional(),
  q: z.string().trim().max(200).optional(),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

export const updateLeadSchema = z
  .object({
    status: leadStatusSchema.optional(),
    notes: z.string().max(10_000).nullable().optional(),
    /** Kept only while the lead is LOST. */
    lostReason: lostReasonSchema.nullable().optional(),
    /** `yyyy-mm-dd`; null clears it. */
    followUpOn: z.iso.date().nullable().optional(),
  })
  .strict();
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const createLeadReplySchema = z
  .object({
    subject: z.string().trim().min(1).max(200),
    /** Plain text; blank lines separate paragraphs. */
    body: z.string().trim().min(1).max(20_000),
  })
  .strict();
export type CreateLeadReplyInput = z.infer<typeof createLeadReplySchema>;

export const exportLeadsQuerySchema = z.object({
  status: leadStatusSchema.optional(),
  q: z.string().trim().max(200).optional(),
});
export type ExportLeadsQuery = z.infer<typeof exportLeadsQuerySchema>;

export const convertLeadSchema = z
  .object({
    /** Name of the project to open; defaults to the lead's company or name. */
    projectName: z.string().trim().min(1).max(200).optional(),
  })
  .strict();
export type ConvertLeadInput = z.infer<typeof convertLeadSchema>;
