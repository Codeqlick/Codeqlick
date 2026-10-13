import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cache } from 'react';
import { Markdown } from '@/components/markdown/Markdown';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { getPost } from '@/lib/api/posts';
import type { Locale } from '@/lib/api/types';
import { formatDate } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import styles from '../../site.module.css';

type PageProps = { params: Promise<{ locale: string; slug: string }> };

/** Shared by generateMetadata and the page; a missing post renders the 404 page. */
const loadPost = cache(async (slug: string, locale: Locale) => {
  try {
    return await getPost(slug, locale);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  const post = await loadPost(slug, locale);
  return pageMetadata({
    locale,
    path: `/blog/${post.slug}`,
    title: post.title,
    description: post.excerpt,
    images: post.coverImageUrl ? [post.coverImageUrl] : undefined,
  });
}

export default async function BlogPostPage({ params }: PageProps) {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Blog' });
  const post = await loadPost(slug, locale);

  return (
    <article className={`wrap ${styles.page} ${styles.narrow}`}>
      <Link href="/blog" className={styles.back}>
        ← {t('back')}
      </Link>
      <p className={styles.meta}>
        <time dateTime={post.publishedAt}>
          {t('publishedOn', { date: formatDate(post.publishedAt, locale) })}
        </time>
      </p>
      <h1 className={styles.title}>{post.title}</h1>
      <p className={`lead ${styles.lead}`}>{post.excerpt}</p>
      {post.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- covers are arbitrary remote URLs
        <img src={post.coverImageUrl} alt="" className={`${styles.cover} ${styles.hero}`} />
      ) : null}
      <div className={styles.content}>
        <Markdown>{post.content}</Markdown>
      </div>
    </article>
  );
}
