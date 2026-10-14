import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cache } from 'react';
import { PostArticle } from '@/components/content/PostArticle';
import { JsonLd } from '@/components/seo/JsonLd';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { getPost } from '@/lib/api/posts';
import type { Locale } from '@/lib/api/types';
import { absoluteUrl, DEFAULT_OG_IMAGE, pageMetadata } from '@/lib/seo';
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
    <PostArticle post={post} locale={locale}>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.excerpt,
          datePublished: post.publishedAt,
          inLanguage: locale,
          image: post.coverImageUrl ?? absoluteUrl(DEFAULT_OG_IMAGE.url),
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
  );
}
