import { z } from 'zod';
import {
  localeQuerySchema,
  localeSchema,
  nullableUrlSchema,
  publishedAtSchema,
  paginationSchema,
  slugSchema,
  translationsArray,
} from '../../common/schemas/common.schemas.js';
import { tagIdsSchema } from './tags.schemas.js';

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
    publishedAt: publishedAtSchema,
    tagIds: tagIdsSchema.default([]),
  })
  .strict();
export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z
  .object({
    slug: slugSchema.optional(),
    status: publishStatusSchema.optional(),
    coverImageUrl: nullableUrlSchema,
    translations: translationsArray(postTranslationSchema).optional(),
    publishedAt: publishedAtSchema,
    tagIds: tagIdsSchema.optional(),
  })
  .strict();
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const listPublicPostsQuerySchema = paginationSchema.extend({
  ...localeQuerySchema.shape,
  /** Only posts with this tag (its slug). */
  tag: slugSchema.optional(),
});

export const relatedPostsQuerySchema = localeQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(6).default(3),
});
export type RelatedPostsQuery = z.infer<typeof relatedPostsQuerySchema>;
export type ListPublicPostsQuery = z.infer<typeof listPublicPostsQuerySchema>;

export const listAdminPostsQuerySchema = paginationSchema.extend({
  status: publishStatusSchema.optional(),
});
export type ListAdminPostsQuery = z.infer<typeof listAdminPostsQuerySchema>;
