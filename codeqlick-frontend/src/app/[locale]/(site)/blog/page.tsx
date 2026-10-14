import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { listPosts } from '@/lib/api/posts';
import type { Paginated, PostSummary } from '@/lib/api/types';
import { formatDate, parsePage } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import styles from '../site.module.css';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Blog' });
  const metadata = pageMetadata({
    locale,
    path: '/blog',
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
  return {
    ...metadata,
    alternates: {
      ...metadata.alternates,
      types: { 'application/rss+xml': `/${locale}/blog/feed.xml` },
    },
  };
}

export default async function BlogPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Blog' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const page = parsePage((await searchParams).page);

  let posts: Paginated<PostSummary> | null = null;
  try {
    posts = await listPosts({ locale, page, pageSize: 12 });
  } catch {
    // Rendered below as a notice: a failing API shouldn't take the whole page down.
  }

  return (
    <section className={`wrap ${styles.page}`}>
      <p className="eyebrow">{t('eyebrow')}</p>
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={`lead ${styles.lead}`}>{t('lead')}</p>

      {posts === null ? (
        <div className={styles.listBlock}>
          <Alert tone="error">{tc('unavailable')}</Alert>
        </div>
      ) : posts.items.length === 0 ? (
        <div className={styles.listBlock}>
          <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
        </div>
      ) : (
        <>
          <ul className={styles.list}>
            {posts.items.map((post) => (
              <Card as="li" bordered key={post.slug}>
                {post.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- covers are arbitrary remote URLs
                  <img src={post.coverImageUrl} alt="" className={styles.cover} loading="lazy" />
                ) : null}
                <p className={styles.meta}>
                  <time dateTime={post.publishedAt}>{formatDate(post.publishedAt, locale)}</time>
                </p>
                <h2 className={styles.itemTitle}>
                  <Link href={`/blog/${post.slug}`}>{post.title}</Link>
                </h2>
                <p className={styles.excerpt}>{post.excerpt}</p>
                <Link
                  href={`/blog/${post.slug}`}
                  className={styles.more}
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  {t('readMore')}
                </Link>
              </Card>
            ))}
          </ul>
          <Pagination page={posts.page} totalPages={posts.totalPages} pathname="/blog" />
        </>
      )}
    </section>
  );
}
