import { getTranslations } from 'next-intl/server';
import styles from '@/app/[locale]/(site)/site.module.css';
import { Card } from '@/components/ui/Card';
import { Link } from '@/i18n/navigation';
import type { AppLocale } from '@/i18n/routing';
import type { PostSummary } from '@/lib/api/types';
import { formatDate } from '@/lib/format';
import { TagLinks } from './TagLinks';

/** A post in a list: the blog index and "related posts". */
export async function PostCard({
  post,
  locale,
  headingLevel = 2,
}: {
  post: PostSummary;
  locale: AppLocale;
  headingLevel?: 2 | 3;
}) {
  const t = await getTranslations({ locale, namespace: 'Blog' });
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  return (
    <Card as="li" bordered>
      {post.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- covers are arbitrary remote URLs
        <img src={post.coverImageUrl} alt="" className={styles.cover} loading="lazy" />
      ) : null}
      <p className={styles.meta}>
        <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, locale)}</time>
      </p>
      <Heading className={styles.itemTitle}>
        <Link href={`/blog/${post.slug}`}>{post.title}</Link>
      </Heading>
      <p className={styles.excerpt}>{post.excerpt}</p>
      <TagLinks tags={post.tags} label={t('tagsLabel')} />
      <Link href={`/blog/${post.slug}`} className={styles.more} aria-hidden="true" tabIndex={-1}>
        {t('readMore')}
      </Link>
    </Card>
  );
}
