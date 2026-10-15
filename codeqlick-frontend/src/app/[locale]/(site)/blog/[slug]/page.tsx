import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cache } from 'react';
import { PostArticle } from '@/components/content/PostArticle';
import { PostCard } from '@/components/content/PostCard';
import { JsonLd } from '@/components/seo/JsonLd';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { getPost, getRelatedPosts } from '@/lib/api/posts';
import type { Locale, PostSummary } from '@/lib/api/types';
import { absoluteUrl, pageMetadata, shareImage } from '@/lib/seo';
import { SITE_NAME } from '@/lib/site';
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
    images: [shareImage(post.coverImageUrl, `/${locale}/blog/${post.slug}/og`, post.title)],
  });
}

export default async function BlogPostPage({ params }: PageProps) {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Blog' });
  const post = await loadPost(slug, locale);
  let related: PostSummary[] = [];
  try {
    related = await getRelatedPosts(post.slug, locale);
  } catch {
    // Optional: the post reads fine without suggestions.
  }

  return (
    <>
      <PostArticle post={post} locale={locale}>
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            description: post.excerpt,
            datePublished: post.publishedAt,
            inLanguage: locale,
            image: post.coverImageUrl ?? absoluteUrl(`/${locale}/blog/${post.slug}/og`),
            mainEntityOfPage: absoluteUrl(`/${locale}/blog/${post.slug}`),
            author: { '@type': 'Organization', name: SITE_NAME, url: absoluteUrl('/') },
            publisher: {
              '@type': 'Organization',
              name: SITE_NAME,
              logo: { '@type': 'ImageObject', url: absoluteUrl('/favicon-512.png') },
            },
          }}
        />
        <Link href="/blog" className={styles.back}>
          ← {t('back')}
        </Link>
      </PostArticle>
      {related.length > 0 ? (
        <section className={`wrap ${styles.related}`} aria-labelledby="related-heading">
          <h2 id="related-heading" className={styles.listHeading}>
            {t('related')}
          </h2>
          <ul className={styles.list}>
            {related.map((item) => (
              <PostCard key={item.slug} post={item} locale={locale} headingLevel={3} />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
