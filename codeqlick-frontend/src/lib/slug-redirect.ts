import { isNotFound } from '@/lib/api/errors';

/** The public sections whose items have a slug that can change (decision 71). */
export type ContentSection = 'blog' | 'work';

/** What a slug of a post or case study leads to. */
export type SlugLookup<T> =
  | { status: 'found'; item: T }
  /** An old slug: the item now lives at `slug`. */
  | { status: 'moved'; slug: string }
  | { status: 'missing' };

/**
 * Loads a post or case study by its slug; when the API has nothing there, asks whether it is an
 * old slug of a live item (architecture 6.2, decision 71). Errors other than 404 are rethrown.
 */
export async function lookUpSlug<T>(
  slug: string,
  load: (slug: string) => Promise<T>,
  findRedirect: (slug: string) => Promise<{ slug: string }>,
): Promise<SlugLookup<T>> {
  try {
    return { status: 'found', item: await load(slug) };
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  let target: { slug: string };
  try {
    target = await findRedirect(slug);
  } catch (error) {
    if (isNotFound(error)) return { status: 'missing' };
    throw error;
  }
  // An answer pointing back to the same slug would redirect forever.
  if (!target.slug || target.slug === slug) return { status: 'missing' };
  return { status: 'moved', slug: target.slug };
}

/** Public path of a post or case study, e.g. `/es/blog/building-a-client-portal`. */
export function contentPath(locale: string, section: ContentSection, slug: string): string {
  return `/${locale}/${section}/${encodeURIComponent(slug)}`;
}
