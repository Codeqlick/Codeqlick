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
import { FilterChips } from '@/components/content/FilterChips';
import { SERVICES } from '@/components/content/services';
import { getPortfolioFilters, listPortfolio } from '@/lib/api/portfolio';
import type { Paginated, PortfolioFilters, PortfolioSummary, ServiceKey } from '@/lib/api/types';
import { firstParam, parsePage } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import styles from '../site.module.css';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: string | string[];
    service?: string | string[];
    technology?: string | string[];
  }>;
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
  const th = await getTranslations({ locale, namespace: 'Home' });
  const query = await searchParams;
  const page = parsePage(query.page);
  const requestedService = firstParam(query.service);
  const service = SERVICES.find(({ key }) => key === requestedService)?.key as
    ServiceKey | undefined;
  const technology = firstParam(query.technology)?.trim().slice(0, 60) || undefined;

  let portfolio: Paginated<PortfolioSummary> | null = null;
  let filters: PortfolioFilters = { technologies: [], services: [] };
  try {
    [portfolio, filters] = await Promise.all([
      listPortfolio({ locale, page, pageSize: 12, service, technology }),
      getPortfolioFilters(),
    ]);
  } catch {
    // Rendered below as a notice: a failing API shouldn't take the whole page down.
  }
  const filtered = service !== undefined || technology !== undefined;
  // Each chip keeps the other filter: they combine.
  const href = (next: { service?: string; technology?: string }) => ({
    pathname: '/work' as const,
    query: Object.fromEntries(
      Object.entries({ service, technology, ...next }).filter(([, value]) => value),
    ),
  });

  return (
    <section className={`wrap ${styles.page}`}>
      <p className="eyebrow">{t('eyebrow')}</p>
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={`lead ${styles.lead}`}>{t('lead')}</p>

      {filters.services.length > 0 || filters.technologies.length > 1 ? (
        <div className={styles.filters}>
          {filters.services.length > 0 ? (
            <FilterChips
              label={t('filterServices')}
              all={{
                label: t('allServices'),
                href: href({ service: undefined }),
                active: !service,
              }}
              chips={filters.services.map((entry) => ({
                key: entry.key,
                label: th(`services.items.${entry.key}.title`),
                count: entry.count,
                href: href({ service: entry.key }),
                active: entry.key === service,
              }))}
            />
          ) : null}
          {filters.technologies.length > 1 ? (
            <FilterChips
              label={t('filterTechnologies')}
              all={{
                label: t('allTechnologies'),
                href: href({ technology: undefined }),
                active: !technology,
              }}
              chips={filters.technologies.map((entry) => ({
                key: entry.name,
                label: entry.name,
                count: entry.count,
                href: href({ technology: entry.name }),
                active: entry.name === technology,
              }))}
            />
          ) : null}
        </div>
      ) : null}

      {portfolio === null ? (
        <div className={styles.listBlock}>
          <Alert tone="error">{tc('unavailable')}</Alert>
        </div>
      ) : portfolio.items.length === 0 ? (
        <div className={styles.listBlock}>
          {filtered ? (
            <EmptyState
              title={t('emptyFilteredTitle')}
              body={t('emptyFilteredBody')}
              action={<Link href="/work">{t('clearFilters')}</Link>}
            />
          ) : (
            <EmptyState
              title={t('emptyTitle')}
              body={t('emptyBody')}
              action={<Button href="/contact">{tn('startProject')}</Button>}
            />
          )}
        </div>
      ) : (
        <>
          <ul className={styles.list}>
            {portfolio.items.map((item, index) => (
              <Card as="li" bordered key={item.slug}>
                {item.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- covers are arbitrary remote URLs
                  <img
                    src={item.coverImageUrl}
                    alt=""
                    className={styles.cover}
                    // The first covers are on screen at once: the page's largest paint.
                    loading={index < 3 ? 'eager' : 'lazy'}
                    fetchPriority={index < 3 ? 'high' : undefined}
                  />
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
          <Pagination
            page={portfolio.page}
            totalPages={portfolio.totalPages}
            pathname="/work"
            query={{ service, technology }}
          />
        </>
      )}
    </section>
  );
}
