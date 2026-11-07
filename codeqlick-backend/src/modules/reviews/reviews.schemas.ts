import { z } from 'zod';
import { localeSchema } from '../../common/schemas/common.schemas.js';

export const submitReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    quote: z.string().trim().min(10).max(1500),
    authorName: z.string().trim().min(1).max(120),
    authorRole: z.string().trim().max(160).optional(),
    /** They allow it on the website. */
    consent: z.boolean(),
    locale: localeSchema,
  })
  .strict();
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

export const reviewStatusSchema = z.object({ status: z.enum(['PUBLISHED', 'HIDDEN']) }).strict();

export const publicReviewsQuerySchema = z.object({
  locale: localeSchema.default('en'),
  limit: z.coerce.number().int().min(1).max(12).default(6),
});
export type PublicReviewsQuery = z.infer<typeof publicReviewsQuerySchema>;
