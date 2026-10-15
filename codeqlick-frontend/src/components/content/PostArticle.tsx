import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import styles from '@/app/[locale]/(site)/site.module.css';
import { Markdown } from '@/components/markdown/Markdown';
import type { AppLocale } from '@/i18n/routing';
import type { PublicTag } from '@/lib/api/types';
import { formatDate } from '@/lib/format';
import { CoverImage } from './CoverImage';
import { TagLinks } from './TagLinks';

export type PostArticleContent = {
  title: string;
  excerpt: string;
  content: string;
  coverImageUrl: string | null;
  /** Null for a draft that was never published: the date line is left out. */
  publishedAt: string | null;
  /** Linked to the blog filtered by each; the admin preview has none. */
  tags?: PublicTag[];
};

/** A blog post as readers see it. Shared by the public page and the admin preview. */
export async function PostArticle({
  post,
  locale,
  children,
}: {
  post: PostArticleContent;
  locale: AppLocale;
  /** Rendered first inside the article (back link, structured data). */
  children?: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: 'Blog' });

  return (
    <article className={`wrap ${styles.page} ${styles.narrow}`}>
      {children}
      {post.publishedAt ? (
        <p className={styles.meta}>
          <time dateTime={post.publishedAt}>
            {t('publishedOn', { date: formatDate(post.publishedAt, locale) })}
          </time>
        </p>
      ) : null}
      <h1 className={styles.title}>{post.title}</h1>
      <p className={`lead ${styles.lead}`}>{post.excerpt}</p>
      {post.tags && post.tags.length > 0 ? (
        <div className={styles.topics}>
          <TagLinks tags={post.tags} label={t('tagsLabel')} />
        </div>
      ) : null}
      {post.coverImageUrl ? (
        <CoverImage
          src={post.coverImageUrl}
          className={`${styles.cover} ${styles.hero}`}
          variant="hero"
          priority
        />
      ) : null}
      <div className={styles.content}>
        <Markdown>{post.content}</Markdown>
      </div>
    </article>
  );
}
