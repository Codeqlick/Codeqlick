import { z } from 'zod';
import { Locale } from '../../generated/prisma/client.js';

/** Query params shared by every paginated list. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationSchema>;

/** Locale as used on the HTTP API (lowercase). */
export const localeSchema = z.enum(['en', 'es']);
export type ApiLocale = z.infer<typeof localeSchema>;

/** `?locale=` query param, defaulting to English. */
export const localeQuerySchema = z.object({
  locale: localeSchema.default('en'),
});
export type LocaleQuery = z.infer<typeof localeQuerySchema>;

export const slugSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be lowercase letters, digits and single hyphens');

export const idParamSchema = z.object({ id: z.uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

export const slugParamSchema = z.object({ slug: slugSchema });
export type SlugParam = z.infer<typeof slugParamSchema>;

/** Optional nullable absolute URL (`undefined` = not provided, `null` = clear it). */
export const nullableUrlSchema = z.url().max(2048).nullable().optional();

/** Publication date with its offset; in the future it schedules the item. `null` means now. */
export const publishedAtSchema = z.iso.datetime({ offset: true }).nullable().optional();

export function toDbLocale(locale: ApiLocale): Locale {
  return locale === 'es' ? Locale.ES : Locale.EN;
}

export function toApiLocale(locale: Locale): ApiLocale {
  return locale === Locale.ES ? 'es' : 'en';
}

/** Validates a translations array: at least one 'en', no duplicate locales. */
export function translationsArray<T extends z.ZodType<{ locale: ApiLocale }>>(item: T) {
  const locales = (list: unknown[]): ApiLocale[] =>
    (list as Array<{ locale: ApiLocale }>).map((t) => t.locale);
  return z
    .array(item)
    .min(1)
    .max(2)
    .refine((list) => locales(list).includes('en'), {
      message: "An 'en' translation is required",
    })
    .refine((list) => new Set(locales(list)).size === list.length, {
      message: 'Each locale may appear only once',
    });
}
