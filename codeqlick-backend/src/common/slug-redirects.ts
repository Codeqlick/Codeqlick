/**
 * The slug to keep as a redirect when a post's or case study's slug changes (decision 51): the
 * old one, when the item had a publication date before the save (published, now or before, or
 * scheduled). A draft that was never published leaves nothing, since nobody can have linked it.
 */
export function slugToRedirect(
  before: { slug: string; publishedAt: Date | null },
  nextSlug: string | undefined,
): string | undefined {
  if (nextSlug === undefined || nextSlug === before.slug || before.publishedAt === null) {
    return undefined;
  }
  return before.slug;
}
