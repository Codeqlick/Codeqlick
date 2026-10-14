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
import { publishStatusSchema } from '../posts/posts.schemas.js';

export const portfolioTranslationSchema = z
  .object({
    locale: localeSchema,
    title: z.string().trim().min(1).max(200),
    summary: z.string().trim().min(1).max(1000),
    content: z.string().min(1).max(200_000),
  })
  .strict();
export type PortfolioTranslationInput = z.infer<typeof portfolioTranslationSchema>;

const technologiesSchema = z.array(z.string().trim().min(1).max(60)).max(50);
const sortOrderSchema = z.number().int().min(-100_000).max(100_000);
const clientNameSchema = z.string().trim().min(1).max(160).nullable().optional();

export const createPortfolioSchema = z
  .object({
    slug: slugSchema,
    status: publishStatusSchema,
    clientName: clientNameSchema,
    projectUrl: nullableUrlSchema,
    coverImageUrl: nullableUrlSchema,
    technologies: technologiesSchema,
    sortOrder: sortOrderSchema,
    translations: translationsArray(portfolioTranslationSchema),
    publishedAt: publishedAtSchema,
  })
  .strict();
export type CreatePortfolioInput = z.infer<typeof createPortfolioSchema>;

export const updatePortfolioSchema = z
  .object({
    slug: slugSchema.optional(),
    status: publishStatusSchema.optional(),
    clientName: clientNameSchema,
    projectUrl: nullableUrlSchema,
    coverImageUrl: nullableUrlSchema,
    technologies: technologiesSchema.optional(),
    sortOrder: sortOrderSchema.optional(),
    translations: translationsArray(portfolioTranslationSchema).optional(),
    publishedAt: publishedAtSchema,
  })
  .strict();
export type UpdatePortfolioInput = z.infer<typeof updatePortfolioSchema>;

export const listPublicPortfolioQuerySchema = paginationSchema.extend(localeQuerySchema.shape);
export type ListPublicPortfolioQuery = z.infer<typeof listPublicPortfolioQuerySchema>;

export const listAdminPortfolioQuerySchema = paginationSchema.extend({
  status: publishStatusSchema.optional(),
});
export type ListAdminPortfolioQuery = z.infer<typeof listAdminPortfolioQuerySchema>;
