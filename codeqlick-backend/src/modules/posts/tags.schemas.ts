import { z } from 'zod';
import { slugSchema } from '../../common/schemas/common.schemas.js';

const tagName = z.string().trim().min(1).max(40);

export const createTagSchema = z
  .object({ slug: slugSchema, nameEn: tagName, nameEs: tagName })
  .strict();
export type CreateTagInput = z.infer<typeof createTagSchema>;

export const updateTagSchema = createTagSchema.partial().strict();
export type UpdateTagInput = z.infer<typeof updateTagSchema>;

/** Up to 10 tags per post, by id. */
export const tagIdsSchema = z.array(z.uuid()).max(10);
