import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { listPortfolio } from '@/lib/api/portfolio';
import type { Paginated, PortfolioSummary } from '@/lib/api/types';
import { parsePage } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import styles from '../site.module.css';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Work' });
  return pageMetadata({
    locale,
    path: '/work',
    title: t('metaTitle'),
    description: t('metaDescription'),
  });
}

export default async function WorkPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'Work' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const tn = await getTranslations({ locale, namespace: 'Nav' });
  const page = parsePage((await searchParams).page);

  let portfolio: Paginated<PortfolioSummary> | null = null;
  try {
    portfolio = await listPortfolio({ locale, page, pageSize: 12 });
  } catch {
    // Rendered below as a notice: a failing API shouldn't take the whole page down.
  }

  return (
    <section className={`wrap ${styles.page}`}>
      <p className="eyebrow">{t('eyebrow')}</p>
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={`lead ${styles.lead}`}>{t('lead')}</p>

      {portfolio === null ? (
        <div className={styles.listBlock}>
          <Alert tone="error">{tc('unavailable')}</Alert>
        </div>
      ) : portfolio.items.length === 0 ? (
        <div className={styles.listBlock}>
          <EmptyState
            title={t('emptyTitle')}
            body={t('emptyBody')}
            action={<Button href="/contact">{tn('startProject')}</Button>}
          />
        </div>
      ) : (
        <>
          <ul className={styles.list}>
            {portfolio.items.map((item) => (
              <Card as="li" bordered key={item.slug}>
                {item.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- covers are arbitrary remote URLs
                  <img src={item.coverImageUrl} alt="" className={styles.cover} loading="lazy" />
                ) : null}
                {item.clientName ? <p className={styles.meta}>{item.clientName}</p> : null}
                <h2 className={styles.itemTitle}>
                  <Link href={`/work/${item.slug}`}>{item.title}</Link>
                </h2>
                <p className={styles.excerpt}>{item.summary}</p>
                {item.technologies.length > 0 ? (
                  <ul className={styles.tags} aria-label={t('technologies')}>
                    {item.technologies.map((name) => (
                      <li key={name}>
                        <Badge>{name}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <Link
                  href={`/work/${item.slug}`}
                  className={styles.more}
                  aria-hidden="true"
                  tabIndex={-1}
                >
                  {t('viewCase')}
                </Link>
              </Card>
            ))}
          </ul>
          <Pagination page={portfolio.page} totalPages={portfolio.totalPages} pathname="/work" />
        </>
      )}
    </section>
  );
}
