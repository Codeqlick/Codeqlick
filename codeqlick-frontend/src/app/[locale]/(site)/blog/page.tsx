import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { buttonClassName } from '@/components/ui/buttonStyles';
import fieldStyles from '@/components/ui/Field.module.css';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { PostCard } from '@/components/content/PostCard';
import { TagLinks } from '@/components/content/TagLinks';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { listPosts, listTags } from '@/lib/api/posts';
import type { Paginated, PostSummary, PublicTag } from '@/lib/api/types';
import { firstParam, parsePage } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import styles from '../site.module.css';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: string | string[];
    tag?: string | string[];
    q?: string | string[];
  }>;
};

/** The search box's text: trimmed, at most what the API accepts. */
function searchText(value: string | string[] | undefined): string | undefined {
  return firstParam(value)?.trim().slice(0, 100) || undefined;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const searching = searchText((await searchParams).q) !== undefined;
  const t = await getTranslations({ locale, namespace: 'Blog' });
  const metadata = pageMetadata({
    locale,
    path: '/blog',
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
  return {
    ...metadata,
    // Search results are for readers, not for search engines.
    ...(searching ? { robots: { index: false, follow: true } } : {}),
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
  const query = await searchParams;
  const page = parsePage(query.page);
  const tagSlug = firstParam(query.tag)?.trim() || undefined;
  const q = searchText(query.q);

  let posts: Paginated<PostSummary> | null = null;
  let tags: (PublicTag & { count: number })[] = [];
  try {
    [posts, tags] = await Promise.all([
      listPosts({ locale, page, pageSize: 12, tag: tagSlug, q }),
      listTags(locale),
    ]);
  } catch {
    // Rendered below as a notice: a failing API shouldn't take the whole page down.
  }
  const activeTag = tags.find((tag) => tag.slug === tagSlug);

  return (
    <section className={`wrap ${styles.page}`}>
      <p className="eyebrow">{t('eyebrow')}</p>
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={`lead ${styles.lead}`}>{t('lead')}</p>
      <search>
        <form action={`/${locale}/blog`} className={styles.search}>
          <label htmlFor="blog-search" className="visually-hidden">
            {t('searchLabel')}
          </label>
          <input
            id="blog-search"
            type="search"
            name="q"
            defaultValue={q}
            maxLength={100}
            placeholder={t('searchPlaceholder')}
            className={fieldStyles.control}
          />
          {tagSlug ? <input type="hidden" name="tag" value={tagSlug} /> : null}
          <button type="submit" className={buttonClassName({ variant: 'ink' })}>
            {t('search')}
          </button>
        </form>
      </search>
      {tags.length > 0 ? (
        <div className={styles.topics}>
          <TagLinks tags={tags} active={tagSlug} label={t('topics')} all={t('allTopics')} />
        </div>
      ) : null}

      {posts === null ? (
        <div className={styles.listBlock}>
          <Alert tone="error">{tc('unavailable')}</Alert>
        </div>
      ) : posts.items.length === 0 ? (
        <div className={styles.listBlock}>
          {q ? (
            <EmptyState
              title={t('noResultsTitle', { q })}
              body={t('noResultsBody')}
              action={<Link href="/blog">{t('allPosts')}</Link>}
            />
          ) : tagSlug ? (
            <EmptyState
              title={t('emptyTagTitle')}
              body={t('emptyTagBody')}
              action={<Link href="/blog">{t('allTopics')}</Link>}
            />
          ) : (
            <EmptyState title={t('emptyTitle')} body={t('emptyBody')} />
          )}
        </div>
      ) : (
        <>
          {q ? (
            <h2 className={styles.listHeading} aria-live="polite">
              {t('results', { count: posts.total, q })}{' '}
              <Link href={tagSlug ? `/blog?tag=${tagSlug}` : '/blog'} className={styles.clear}>
                {t('clearSearch')}
              </Link>
            </h2>
          ) : activeTag ? (
            <h2 className={styles.listHeading}>{t('postsAbout', { tag: activeTag.name })}</h2>
          ) : null}
          <ul className={styles.list}>
            {posts.items.map((post) => (
              <PostCard key={post.slug} post={post} locale={locale} />
            ))}
          </ul>
          <Pagination
            page={posts.page}
            totalPages={posts.totalPages}
            pathname="/blog"
            query={{ tag: tagSlug, q }}
          />
        </>
      )}
    </section>
  );
}
