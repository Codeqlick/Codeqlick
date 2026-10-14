import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cache } from 'react';
import { CaseStudyArticle } from '@/components/content/CaseStudyArticle';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { isNotFound } from '@/lib/api/errors';
import { getPortfolioItem } from '@/lib/api/portfolio';
import type { Locale } from '@/lib/api/types';
import { pageMetadata } from '@/lib/seo';
import styles from '../../site.module.css';

type PageProps = { params: Promise<{ locale: string; slug: string }> };

/** Shared by generateMetadata and the page; a missing item renders the 404 page. */
const loadItem = cache(async (slug: string, locale: Locale) => {
  try {
    return await getPortfolioItem(slug, locale);
  } catch (error) {
    if (isNotFound(error)) notFound();
    throw error;
  }
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  const item = await loadItem(slug, locale);
  return pageMetadata({
    locale,
    path: `/work/${item.slug}`,
    title: item.title,
    description: item.summary,
    images: item.coverImageUrl ? [item.coverImageUrl] : undefined,
  });
}

export default async function WorkItemPage({ params }: PageProps) {
  const { locale: rawLocale, slug } = await params;
  const locale = resolveLocale(rawLocale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Work' });
  const item = await loadItem(slug, locale);

  return (
    <CaseStudyArticle item={item} locale={locale}>
      <Link href="/work" className={styles.back}>
        ← {t('back')}
      </Link>
    </CaseStudyArticle>
  );
}
