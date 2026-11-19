import { z } from 'zod';
import { CURRENCIES } from './menu-limits.js';

/**
 * The envelope of every menu request. What is specific to menus (a reserved slug, a link in a text,
 * too many items) is checked by the service and answers 422 with the same field errors.
 */
const text = (max: number) => z.string().trim().max(max);

/** Lenient on purpose: the service says why a slug can't be used (invalid, reserved) with a 422. */
const slugInput = z.string().trim().toLowerCase().min(1).max(80);

const kind = z.enum(['MENU', 'CATALOGUE']);
const language = z.enum(['EN', 'ES']);
const currency = z.enum(CURRENCIES);

const fields = {
  slug: slugInput,
  kind,
  businessName: text(80).min(1),
  language,
  currency,
  title: text(80).min(1),
  intro: text(300),
  address: text(160),
  openingNote: text(300),
  note: text(300),
  enabled: z.boolean(),
  indexable: z.boolean(),
};

export const createMenuSchema = z
  .object({
    slug: fields.slug,
    kind: fields.kind,
    businessName: fields.businessName,
    language: fields.language,
    currency: fields.currency.optional(),
    title: fields.title.optional(),
    intro: fields.intro.optional(),
    address: fields.address.optional(),
    openingNote: fields.openingNote.optional(),
    note: fields.note.optional(),
    enabled: fields.enabled.optional(),
    indexable: fields.indexable.optional(),
    content: z.unknown().optional(),
  })
  .strict();
export type CreateMenuInput = z.infer<typeof createMenuSchema>;

const revision = z.number().int().min(1);

export const updateMenuSchema = z
  .object({ ...fields })
  .partial()
  .extend({ revision, content: z.unknown().optional() })
  .strict();
export type UpdateMenuInput = z.infer<typeof updateMenuSchema>;

export const putContentSchema = z.object({ revision, content: z.unknown() }).strict();
export type PutContentInput = z.infer<typeof putContentSchema>;

export const itemParamSchema = z.object({
  id: z.uuid(),
  key: z.string().regex(/^[a-z0-9]{8}$/),
});
export type ItemParam = z.infer<typeof itemParamSchema>;

export const itemFlagsSchema = z
  .object({ hidden: z.boolean().optional(), soldOut: z.boolean().optional() })
  .strict()
  .refine((value) => value.hidden !== undefined || value.soldOut !== undefined, {
    message: 'Say hidden or soldOut',
  });
export type ItemFlagsInput = z.infer<typeof itemFlagsSchema>;

export const slugCheckSchema = z.object({
  slug: z.string().trim().max(80),
  menuId: z.uuid().optional(),
});
export type SlugCheckQuery = z.infer<typeof slugCheckSchema>;

export const publicSlugParamSchema = z.object({
  slug: z.string().trim().toLowerCase().min(1).max(40),
});
export type PublicSlugParam = z.infer<typeof publicSlugParamSchema>;

export const REPORT_REASONS = [
  'ILLEGAL',
  'PHISHING',
  'IMPERSONATION',
  'COPYRIGHT',
  'SEXUAL',
  'SPAM',
  'OTHER',
] as const;

export const reportSchema = z
  .object({
    slug: z.string().trim().toLowerCase().min(1).max(40),
    reason: z.enum(REPORT_REASONS),
    details: z.string().trim().min(10).max(1000),
    email: z.email().max(254).optional().or(z.literal('')),
    /** Honeypot: people never see this field, bots fill it in. */
    website: z.string().max(500).optional(),
  })
  .strict();
export type ReportInput = z.infer<typeof reportSchema>;

export const adminMenusQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  suspended: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminMenusQuery = z.infer<typeof adminMenusQuerySchema>;

export const adminReportsQuerySchema = z.object({
  status: z.enum(['OPEN', 'CLOSED']).default('OPEN'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminReportsQuery = z.infer<typeof adminReportsQuerySchema>;

export const suspendSchema = z.object({ reason: z.string().trim().min(5).max(500) }).strict();
export type SuspendInput = z.infer<typeof suspendSchema>;

export const closeReportSchema = z
  .object({ note: z.string().trim().max(1000).optional() })
  .strict();
export type CloseReportInput = z.infer<typeof closeReportSchema>;
