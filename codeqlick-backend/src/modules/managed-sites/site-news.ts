import { z } from 'zod';
import type { SiteNewsPost } from '../../generated/prisma/client.js';
import { madridInstant, madridParts } from '../projects/digest-schedule.js';

/** Posts a site can keep (architecture 8.2). */
export const MAX_NEWS_POSTS = 200;

const SLUG_MAX = 60;
const ALLOWED_LINK = /^(?:https?:|mailto:|tel:)/i;
const MARKDOWN_LINK = /\[[^\]]*\]\(([^)]*)\)/g;

/** The link targets of a Markdown body that are not `http`, `https`, `mailto` or `tel`. */
export function disallowedLinks(body: string): string[] {
  return [...body.matchAll(MARKDOWN_LINK)]
    .map((match) => (match[1] ?? '').trim())
    .filter((target) => !ALLOWED_LINK.test(target));
}

/**
 * The address a title gives its post: lowercase letters, digits and dashes, at most 60
 * characters. A slug of only digits would collide with the list's pages (`/noticias/2`), so it
 * gets a word after it.
 */
export function slugOf(title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, '');
  if (!slug) return 'noticia';
  return /^\d+$/.test(slug) ? `${slug}-noticia` : slug;
}

/** A write refused because the value is taken (Prisma's P2002). */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'PrismaClientKnownRequestError' &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/** `base`, or `base-2`, `base-3`… the first the site doesn't have yet. */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** The last instant of a Madrid day (`yyyy-mm-dd`): an offer is shown through that day. */
export function endOfMadridDay(day: string): Date {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  return new Date(madridInstant(year, month, date + 1, 0).getTime() - 1);
}

/** The Madrid day (`yyyy-mm-dd`) an instant falls in. */
export function madridDayOf(instant: Date): string {
  const { year, month, day } = madridParts(instant);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export type NewsStatus = 'DRAFT' | 'PUBLISHED' | 'EXPIRED';

/** A post's state is derived from its dates. */
export function newsStatus(
  post: Pick<SiteNewsPost, 'publishedAt' | 'expiresAt'>,
  now: Date,
): NewsStatus {
  if (!post.publishedAt) return 'DRAFT';
  return post.expiresAt && post.expiresAt.getTime() < now.getTime() ? 'EXPIRED' : 'PUBLISHED';
}

const title = z.string().trim().min(1).max(120);
const summary = z.string().trim().min(1).max(300);
const body = z
  .string()
  .trim()
  .min(1)
  .max(10_000)
  .refine(
    (value) => disallowedLinks(value).length === 0,
    'Links must start with http://, https://, mailto: or tel:',
  );
/** A photo from the site's uploads: `media/<uuid>.<ext>`. */
const photo = z
  .string()
  .regex(/^media\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\.(?:png|jpg|webp)$/, 'Not a photo');

export const createNewsSchema = z
  .object({
    title,
    summary,
    body,
    photo: photo.nullable().optional(),
    expiresAt: z.iso.date().nullable().optional(),
  })
  .strict();
export type CreateNewsInput = z.infer<typeof createNewsSchema>;

export const updateNewsSchema = z
  .object({
    title: title.optional(),
    summary: summary.optional(),
    body: body.optional(),
    photo: photo.nullable().optional(),
    expiresAt: z.iso.date().nullable().optional(),
  })
  .strict();
export type UpdateNewsInput = z.infer<typeof updateNewsSchema>;

export const newsListQuerySchema = z.object({
  status: z.enum(['DRAFT', 'PUBLISHED', 'EXPIRED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type NewsListQuery = z.infer<typeof newsListQuerySchema>;

export const newsSettingsBodySchema = z.object({ enabled: z.boolean() }).strict();
export type NewsSettingsBody = z.infer<typeof newsSettingsBodySchema>;

export const newsParamSchema = z.object({ id: z.uuid(), postId: z.uuid() });
export type NewsParam = z.infer<typeof newsParamSchema>;

/** A post as the portal and the admin see it (`SiteNewsPost`, architecture section 5). */
export interface SiteNewsPostView {
  id: string;
  slug: string;
  title: string;
  summary: string;
  body: string;
  photo: { file: string; url: string } | null;
  status: NewsStatus;
  publishedAt: string | null;
  expiresAt: string | null;
  url: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A post in the content the builder gets, under `news.posts` (architecture 8.2): newest first,
 * only published and not expired ones; `photo.file` is `media/<file>`, copied like the content's.
 */
export interface BuildNewsPost {
  slug: string;
  title: string;
  summary: string;
  body: string;
  photo?: { file: string; alt: string };
  publishedAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export function toBuildPost(post: SiteNewsPost): BuildNewsPost | undefined {
  if (!post.publishedAt) return undefined;
  return {
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    body: post.body,
    ...(post.photo ? { photo: { file: post.photo, alt: post.title } } : {}),
    publishedAt: post.publishedAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    ...(post.expiresAt ? { expiresAt: post.expiresAt.toISOString() } : {}),
  };
}
