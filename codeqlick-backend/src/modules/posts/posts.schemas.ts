import { z } from 'zod';
import {
  localeQuerySchema,
  localeSchema,
  nullableUrlSchema,
  paginationSchema,
  slugSchema,
  translationsArray,
} from '../../common/schemas/common.schemas.js';

export const publishStatusSchema = z.enum(['DRAFT', 'PUBLISHED']);

export const postTranslationSchema = z
  .object({
    locale: localeSchema,
    title: z.string().trim().min(1).max(200),
    excerpt: z.string().trim().min(1).max(500),
    content: z.string().min(1).max(200_000),
  })
  .strict();
export type PostTranslationInput = z.infer<typeof postTranslationSchema>;

export const createPostSchema = z
  .object({
    slug: slugSchema,
    status: publishStatusSchema,
    coverImageUrl: nullableUrlSchema,
    translations: translationsArray(postTranslationSchema),
  })
  .strict();
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z
  .object({
    slug: slugSchema.optional(),
    status: publishStatusSchema.optional(),
    coverImageUrl: nullableUrlSchema,
    translations: translationsArray(postTranslationSchema).optional(),
  })
  .strict();
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const listPublicPostsQuerySchema = paginationSchema.extend(localeQuerySchema.shape);
export type ListPublicPostsQuery = z.infer<typeof listPublicPostsQuerySchema>;

export const listAdminPostsQuerySchema = paginationSchema.extend({
  status: publishStatusSchema.optional(),
});
export type ListAdminPostsQuery = z.infer<typeof listAdminPostsQuerySchema>;
