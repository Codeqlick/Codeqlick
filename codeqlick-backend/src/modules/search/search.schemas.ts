import { z } from 'zod';
import { localeSchema } from '../../common/schemas/common.schemas.js';

/** `GET /admin/search` (architecture 4.14): `q` trimmed, 2–100 characters. */
export const adminSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  /** Language of post and case-study titles. */
  locale: localeSchema.default('en'),
});
export type AdminSearchQuery = z.infer<typeof adminSearchQuerySchema>;
