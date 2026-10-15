import { getTranslations } from 'next-intl/server';
import styles from '@/components/app/app.module.css';
import { PageHeader } from '@/components/app/PageHeader';
import { PublishStatusBadge } from '@/components/app/StatusBadges';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { adminListPortfolio } from '@/lib/api/portfolio';
import { formatDateTime, isScheduled, parsePage } from '@/lib/format';

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
};

export default async function AdminPortfolioPage({ params, searchParams }: PageProps) {
  const locale = resolveLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Admin.portfolio' });
  const tc = await getTranslations({ locale, namespace: 'Common' });
  const ts = await getTranslations({ locale, namespace: 'PublishStatuses' });
  const items = await adminListPortfolio({ page: parsePage((await searchParams).page) });
  const newButton = <Button href="/admin/portfolio/new">{t('new')}</Button>;

  return (
    <>
      <PageHeader title={t('title')} actions={newButton} />
      {items.items.length === 0 ? (
        <EmptyState title={t('emptyTitle')} body={t('emptyBody')} action={newButton} />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('itemTitle')}</th>
                  <th scope="col">{t('clientName')}</th>
                  <th scope="col">{t('status')}</th>
                  <th scope="col">{t('sortOrder')}</th>
                  <th scope="col">{t('updated')}</th>
                </tr>
              </thead>
              <tbody>
                {items.items.map((item) => (
                  <tr key={item.id}>
                    <th scope="row">
                      <Link href={`/admin/portfolio/${item.id}`}>
                        {item.translations.find((entry) => entry.locale === 'en')?.title ??
                          item.slug}
                      </Link>
                      <span className={styles.sub}>/{item.slug}</span>
                    </th>
                    <td>{item.clientName ?? tc('none')}</td>
                    <td>
                      <PublishStatusBadge
                        status={item.status}
                        scheduled={isScheduled(item)}
                        label={isScheduled(item) ? ts('SCHEDULED') : ts(item.status)}
                      />
                    </td>
                    <td>{item.sortOrder}</td>
                    <td>{formatDateTime(item.updatedAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={items.page} totalPages={items.totalPages} pathname="/admin/portfolio" />
        </>
      )}
    </>
  );
}
