import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cache } from 'react';
import { CaseStudyArticle } from '@/components/content/CaseStudyArticle';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { getPortfolioItem, getPortfolioRedirect } from '@/lib/api/portfolio';
import type { Locale } from '@/lib/api/types';
import { pageMetadata, shareImage } from '@/lib/seo';
import { contentPath, lookUpSlug } from '@/lib/slug-redirect';
import styles from '../../site.module.css';

type PageProps = { params: Promise<{ locale: string; slug: string }> };

/**
 * Shared by generateMetadata and the page, so both settle the same way: an old slug redirects
 * (308) to the case study's current address, a missing item renders the 404 page.
 */
const loadItem = cache(async (slug: string, locale: Locale) => {
  const found = await lookUpSlug(
    slug,
    (current) => getPortfolioItem(current, locale),
    getPortfolioRedirect,
  );
  if (found.status === 'moved') permanentRedirect(contentPath(locale, 'work', found.slug));
  if (found.status === 'missing') notFound();
  return found.item;
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
    images: [shareImage(item.coverImageUrl, `/${locale}/work/${item.slug}/og`, item.title)],
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
