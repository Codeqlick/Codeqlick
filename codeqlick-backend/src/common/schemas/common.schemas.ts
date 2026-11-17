import { z } from 'zod';
import { Locale } from '../../generated/prisma/client.js';

/** Query params shared by every paginated list. */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationSchema>;

/** Locale as used on the HTTP API (lowercase): the website's languages. */
export const localeSchema = z.enum(['en', 'es']);
export type ApiLocale = z.infer<typeof localeSchema>;

/** An account's language: the website's two. */
export const ACCOUNT_LOCALES = ['en', 'es'] as const;
export const accountLocaleSchema = z.enum(ACCOUNT_LOCALES);
export type AccountLocale = z.infer<typeof accountLocaleSchema>;

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

/** `:id/revisions/:revisionId` of a post or case study (decision 72). */
export const contentRevisionParamSchema = z.object({ id: z.uuid(), revisionId: z.uuid() });
export type ContentRevisionParam = z.infer<typeof contentRevisionParamSchema>;

export const slugParamSchema = z.object({ slug: slugSchema });
export type SlugParam = z.infer<typeof slugParamSchema>;

/** Optional nullable absolute URL (`undefined` = not provided, `null` = clear it). */
export const nullableUrlSchema = z.url().max(2048).nullable().optional();

/** Publication date with its offset; in the future it schedules the item. `null` means now. */
export const publishedAtSchema = z.iso.datetime({ offset: true }).nullable().optional();

const DB_LOCALES: Record<AccountLocale, Locale> = {
  en: Locale.EN,
  es: Locale.ES,
};

export function toDbLocale(locale: AccountLocale): Locale {
  return DB_LOCALES[locale];
}

/** An account's language as the API spells it. */
export function toAccountLocale(locale: Locale): AccountLocale {
  return (
    (Object.keys(DB_LOCALES) as AccountLocale[]).find((key) => DB_LOCALES[key] === locale) ?? 'en'
  );
}

/** The website's language for an account language (the same two). */
export function siteLocale(locale: AccountLocale): ApiLocale {
  return locale === 'es' ? 'es' : 'en';
}

/** A stored language as the website's. */
export function toApiLocale(locale: Locale): ApiLocale {
  return siteLocale(toAccountLocale(locale));
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
