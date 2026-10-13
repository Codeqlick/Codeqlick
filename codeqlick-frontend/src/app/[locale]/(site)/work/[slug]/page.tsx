import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { cache } from 'react';
import { Markdown } from '@/components/markdown/Markdown';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
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
    <article className={`wrap ${styles.page} ${styles.narrow}`}>
      <Link href="/work" className={styles.back}>
        ← {t('back')}
      </Link>
      <h1 className={styles.title}>{item.title}</h1>
      <p className={`lead ${styles.lead}`}>{item.summary}</p>

      <dl className={styles.facts}>
        {item.clientName ? (
          <div>
            <dt>{t('client')}</dt>
            <dd>{item.clientName}</dd>
          </div>
        ) : null}
        {item.technologies.length > 0 ? (
          <div>
            <dt>{t('technologies')}</dt>
            <dd>
              <ul className={styles.tags}>
                {item.technologies.map((name) => (
                  <li key={name}>
                    <Badge>{name}</Badge>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
      </dl>

      {item.coverImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- covers are arbitrary remote URLs
        <img src={item.coverImageUrl} alt="" className={`${styles.cover} ${styles.hero}`} />
      ) : null}
      <div className={styles.content}>
        <Markdown>{item.content}</Markdown>
      </div>
      {item.projectUrl ? (
        <div className={styles.actions}>
          <Button href={item.projectUrl} external target="_blank" rel="noopener noreferrer">
            {t('visit')}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
