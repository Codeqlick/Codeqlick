import { snapshotLocale } from '../../common/content-revisions.js';

/** A post's content as a revision keeps it (`PostSnapshot`, architecture 5, decision 52). */
export type PostSnapshot = {
  coverImageUrl: string | null;
  tagIds: string[];
  translations: PostSnapshotTranslation[];
};

export type PostSnapshotTranslation = {
  locale: 'en' | 'es';
  title: string;
  excerpt: string;
  content: string;
};

/** The parts of a stored post a snapshot is made of. */
export interface PostContentRow {
  coverImageUrl: string | null;
  translations: { locale: string; title: string; excerpt: string; content: string }[];
  tags: { tag: { id: string } }[];
}

/** The post's content: no status, publication date or slug (they aren't content). */
export function postSnapshot(post: PostContentRow): PostSnapshot {
  return {
    coverImageUrl: post.coverImageUrl,
    tagIds: post.tags.map((item) => item.tag.id),
    translations: post.translations.map((t) => ({
      locale: snapshotLocale(t.locale),
      title: t.title,
      excerpt: t.excerpt,
      content: t.content,
    })),
  };
}
